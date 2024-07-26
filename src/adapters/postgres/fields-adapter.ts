import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { FieldsDto } from "src/fields/dto/fields.dto";
import { FieldsOptionsSearchDto, FieldsSearchDto } from "src/fields/dto/fields-search.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { FieldValuesUpdateDto } from "src/fields/dto/field-values-update.dto";
import { FieldValuesSearchDto } from "src/fields/dto/field-values-search.dto";
import { ErrorResponse } from "src/error-response";
import { Fields } from "../../fields/entities/fields.entity";
import { FieldValues } from "../../fields/entities/fields-values.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
import { IServicelocatorfields } from "../fieldsservicelocator";
import { Response } from "express";
import { readFileSync } from "fs";
import path, { join } from 'path';
import { FieldFactory } from "src/fields/fieldValidators/fieldFactory";
import { FieldsUpdateDto } from "src/fields/dto/fields-update.dto";
import { SchemaField, Option } from "src/fields/fieldValidators/fieldClass";

@Injectable()
export class PostgresFieldsService implements IServicelocatorfields {
    constructor(
        @InjectRepository(Fields)
        private fieldsRepository: Repository<Fields>,
        @InjectRepository(FieldValues)
        private fieldsValuesRepository: Repository<FieldValues>,
    ) { }

    async getFormCustomField(requiredData, response) {
        let apiId = 'FormData'
        try {
            let whereClause = '(context IS NULL AND "contextType" IS NULL)';
            let fileread = readFileSync(join(process.cwd(), 'src/utils/corefield.json'), 'utf8');
            let corefield = JSON.parse(fileread);
            if (!requiredData.context && !requiredData.contextType) {
                const result = [...corefield.users, ...corefield.cohort];
                let data = await this.getFieldData(whereClause);
                data.push(...result);
                if (!data) {
                    return APIResponse.error(
                        response,
                        apiId,
                        "NOT_FOUND",
                        `Fields not found for the search term`,
                        HttpStatus.NOT_FOUND
                    );
                }
                return APIResponse.success(
                    response,
                    apiId,
                    data,
                    HttpStatus.OK,
                    "Fields fetched successfully."
                );
            }

            if (requiredData.context) {
                whereClause += ` OR context = '${requiredData.context}' AND "contextType" IS NULL`;
            }

            if (requiredData.contextType) {
                whereClause += ` OR "contextType" = '${requiredData.contextType}'`;
            }

            let data = await this.getFieldData(whereClause);
            if (!data) {
                return APIResponse.error(
                    response,
                    apiId,
                    "NOT_FOUND",
                    `Fields not found for the search term`,
                    HttpStatus.NOT_FOUND
                );
            }
            if (requiredData.context === 'USERS' || requiredData.context === 'COHORT') {
                let coreFields = corefield[requiredData.context.toLowerCase()];
                data.push(...coreFields);
            }
            return APIResponse.success(
                response,
                apiId,
                data,
                HttpStatus.OK,
                "Fields fetched successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "Internal Server Error",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    //validate cohort Create/update API Custom field
    public async validateCustomField(cohortCreateDto, contextType) {
        let fieldValues = cohortCreateDto ? cohortCreateDto.customFields : [];
        let encounteredKeys = [];
        let invalidateFields = [];
        let duplicateFieldKeys = [];
        let error = '';

        for (const fieldsData of fieldValues) {
            const fieldId = fieldsData['fieldId'];
            let getFieldDetails: any = await this.getFieldByIdes(fieldId);

            if (getFieldDetails == null) {
                return {
                    isValid: false,
                    error: `Field not found`,
                }
            }

            if (encounteredKeys.includes(fieldId)) {
                duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails['name']}`);
            } else {
                encounteredKeys.push(fieldId);
            }

            if ((getFieldDetails.type == 'checkbox' || getFieldDetails.type == 'drop_down' || getFieldDetails.type == 'radio') && getFieldDetails.sourceDetails.source == 'table') {
                let getOption = await this.findDynamicOptions(getFieldDetails.sourceDetails.table);
                const transformedFieldParams = {
                    options: getOption.map(param => ({ value: param.value, label: param.label }))
                };
                getFieldDetails['fieldParams'] = transformedFieldParams
            } else {
                getFieldDetails['fieldParams'] = getFieldDetails.fieldParams;
            }

            let checkValidation = this.validateFieldValue(getFieldDetails, fieldsData['value']);

            if (typeof checkValidation === 'object' && 'error' in checkValidation) {
                invalidateFields.push(`${fieldId}: ${getFieldDetails['name']} - ${checkValidation?.error?.message}`);
            }
        }

        // Validation for duplicate fields
        if (duplicateFieldKeys.length > 0) {
            return {
                isValid: false,
                error: `Duplicate fieldId detected: ${duplicateFieldKeys}`,
            };
        }

        // Validation for fields values
        if (invalidateFields.length > 0) {
            return {
                isValid: false,
                error: `Invalid fields found: ${invalidateFields}`,
            };
        }
        let context = 'COHORT';
        let getFieldIds = await this.getFieldIds(context, contextType);

        const validFieldIds = new Set(getFieldIds.map(field => field.fieldId));

        const invalidFieldIds = cohortCreateDto.customFields
            .filter(fieldValue => !validFieldIds.has(fieldValue.fieldId))
            .map(fieldValue => fieldValue.fieldId);

        if (invalidFieldIds.length > 0) {
            return {
                isValid: false,
                error: `The following fields are not valid for this user: ${invalidFieldIds.join(', ')}.`,
            };
        }
        return {
            isValid: true,
        };
    }

    async getFieldData(whereClause): Promise<any> {
        let query = `select * from public."Fields" where ${whereClause}`

        let result = await this.fieldsRepository.query(query);
        if (!result) {
            return false;
        }
        for (let data of result) {
            if ((data?.dependsOn == '' || data?.dependsOn == undefined || data?.dependsOn == null) && data?.sourceDetails?.source === 'table' || data?.sourceDetails?.source === 'jsonfile') {
                let options = await this.findDynamicOptions(data.sourceDetails.table);
                data.fieldParams = data.fieldParams || {};
                data.fieldParams.options = options;
            }
        }
        let schema = this.mappedFields(result);
        return schema;
    }

    async createFields(request: any, fieldsDto: FieldsDto, response: Response,) {
        const apiId = APIID.FIELDS_CREATE;
        try {
            const fieldsData: any = {}; // Define an empty object to store field data

            Object.keys(fieldsDto).forEach((e) => {
                if (fieldsDto[e] && fieldsDto[e] !== "") {
                    if (e === "render") {
                        fieldsData[e] = fieldsDto[e];
                    } else if (Array.isArray(fieldsDto[e])) {
                        fieldsData[e] = JSON.stringify(fieldsDto[e]);
                    } else {
                        fieldsData[e] = fieldsDto[e];
                    }
                }
            });
            fieldsData['required'] = true;

            let checkFieldExist = await this.fieldsRepository.find({
                where: {
                    "context": fieldsData.context,
                    "contextType": fieldsData.contextType,
                    "name": fieldsData.name
                }
            })
            if (checkFieldExist.length > 0) {
                APIResponse.error(
                    response,
                    apiId,
                    `Fields already exist`,
                    `CONFLICT`,
                    (HttpStatus.CONFLICT)
                )
            }

            let storeWithoutControllingField = [];
            let error = '';
            if (fieldsData.sourceDetails && fieldsData.sourceDetails.source == 'table' && fieldsData.fieldParams) {

                for (let sourceFieldName of fieldsData.fieldParams.options) {

                    if (fieldsData.dependsOn && (!sourceFieldName['controllingfieldfk'] || sourceFieldName['controllingfieldfk'] === '')) {
                        storeWithoutControllingField.push(sourceFieldName['name'])
                    }
                    let query = `SELECT COUNT(*) FROM public.${fieldsData.sourceDetails.table} WHERE value = '${sourceFieldName['value']}'`;
                    const checkSourceData = await this.fieldsValuesRepository.query(query);

                    if (checkSourceData[0].count == 0) {
                        let createSourceField = await this.createSourceDetailsTableFields(fieldsData.sourceDetails.table, sourceFieldName['name'], sourceFieldName['value'], sourceFieldName['controllingfieldfk'], fieldsData?.dependsOn);
                    } else {
                        let updateSourceField = await this.updateSourceDetailsTableFields(fieldsData.sourceDetails.table, sourceFieldName['name'], sourceFieldName['value'], sourceFieldName['controllingfieldfk']);
                    }
                }
                delete fieldsData.fieldParams;
            }

            if (storeWithoutControllingField.length > 0) {
                let wrongControllingField = storeWithoutControllingField.join(',')
                error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`
            }

            let result = await this.fieldsRepository.save(fieldsData);

            return await APIResponse.success(response, apiId, { result, error },
                HttpStatus.CREATED, 'Fields created successfully.')

        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    async updateFields(fieldId: any, request: any, fieldsUpdateDto: FieldsUpdateDto, response: Response) {
        const apiId = APIID.FIELDS_CREATE;
        try {
            const fieldsData: any = {}; // Define an empty object to store field data
            let storeWithoutControllingField = [];
            let error = '';

            Object.keys(fieldsUpdateDto).forEach((e) => {
                if (fieldsUpdateDto[e] && fieldsUpdateDto[e] !== "") {
                    if (e === "render") {
                        fieldsData[e] = fieldsUpdateDto[e];
                    } else if (Array.isArray(fieldsUpdateDto[e])) {
                        fieldsData[e] = JSON.stringify(fieldsUpdateDto[e]);
                    } else {
                        fieldsData[e] = fieldsUpdateDto[e];
                    }
                }
            });

            const getSourceDetails = await this.fieldsRepository.findOne({
                where: { fieldId: fieldId }
            });

            fieldsData['type'] = fieldsData.type || getSourceDetails.type;

            //Update field options
            //Update data in source table
            if (getSourceDetails.sourceDetails && getSourceDetails.sourceDetails.source == 'table') {
                for (let sourceFieldName of fieldsData.fieldParams.options) {
                    if (getSourceDetails.dependsOn && (!sourceFieldName['controllingfieldfk'] || sourceFieldName['controllingfieldfk'] === '')) {
                        storeWithoutControllingField.push(sourceFieldName['name'])
                    }

                    // check options exits in source table column or not
                    let query = `SELECT COUNT(*) FROM public.${getSourceDetails.sourceDetails.table} WHERE value = '${sourceFieldName['value']}'`;
                    const checkSourceData = await this.fieldsValuesRepository.query(query);

                    //If not exist then create that column else update that data
                    if (checkSourceData[0].count == 0) {
                        let createSourceField = await this.createSourceDetailsTableFields(getSourceDetails.sourceDetails.table, sourceFieldName['name'], sourceFieldName['value'], sourceFieldName['controllingfieldfk'], getSourceDetails.dependsOn);
                    } else {
                        let updateSourceField = await this.updateSourceDetailsTableFields(getSourceDetails.sourceDetails.table, sourceFieldName['name'], sourceFieldName['value'], sourceFieldName['controllingfieldfk']);
                    }
                }
                delete fieldsData.fieldParams;
            }

            //Update data in field params
            if (getSourceDetails.sourceDetails && getSourceDetails.sourceDetails.source == 'fieldparams') {
                for (let sourceFieldName of fieldsData.fieldParams.options) {
                    //Store those fields is depends on another fields but did not provide controlling field foreign key
                    if (fieldsData.dependsOn && (!sourceFieldName['controllingfieldfk'] || sourceFieldName['controllingfieldfk'] === '')) {
                        storeWithoutControllingField.push(sourceFieldName['name'])
                    }

                    // check options exits in fieldParams column or not
                    const query = `SELECT COUNT(*) FROM public."Fields" WHERE "fieldId"='${fieldId}' AND "fieldParams" -> 'options' @> '[{"value": "${sourceFieldName['value']}"}]' `;
                    let checkSourceData = await this.fieldsRepository.query(query);

                    //If fields is not present then create a new options
                    if (checkSourceData[0].count == 0) {
                        let addFieldParamsValue = await this.addOptionsInFieldParams(fieldId, sourceFieldName)
                        if (addFieldParamsValue !== true) {
                            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${addFieldParamsValue}`, HttpStatus.INTERNAL_SERVER_ERROR)
                        }
                    }
                }
            }

            //If fields is depends on another fields but did not provide controlling field foreign key
            if (storeWithoutControllingField.length > 0) {
                let wrongControllingField = storeWithoutControllingField.join(',')
                error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`
            }

            let result = await this.fieldsRepository.update(fieldId, fieldsData);
            return await APIResponse.success(response, apiId, result,
                HttpStatus.CREATED, 'Fields updated successfully.')


        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }


    async addOptionsInFieldParams(fieldId: string, newParams: any) {
        try {
            const existingField = await this.fieldsRepository.findOne({
                where: { fieldId },
            });

            //get existing fields which are present in out database
            const existingOptions = existingField.fieldParams !== null ? existingField.fieldParams['options'] : [];
            const newOption = newParams;

            //merge new fields and old fields 
            const updatedOptions = [...existingOptions, newOption];
            let fieldParams = { options: updatedOptions };
            existingField.fieldParams = fieldParams;

            await this.fieldsRepository.update(fieldId, {
                fieldParams: existingField.fieldParams,
            });
            return true;
        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return errorMessage
        }

    }

    async createSourceDetailsTableFields(tableName: string, name: string, value: string, controllingfieldfk?: string, dependsOn?: string) {
        let createSourceFields = `INSERT INTO public.${tableName} (name, value`;

        // Add controllingfieldfk to the columns if it is defined
        if (controllingfieldfk !== undefined && controllingfieldfk !== '') {
            createSourceFields += `, controllingfieldfk`;
        }

        createSourceFields += `) VALUES ('${name}', '${value}'`;

        // Add controllingfieldfk to the values if it is defined
        if (controllingfieldfk !== undefined && controllingfieldfk !== '') {
            createSourceFields += `, '${controllingfieldfk}'`;
        }

        createSourceFields += `);`;

        if (dependsOn && (!controllingfieldfk || controllingfieldfk === '')) {
            return false;
        }

        //Insert data into source table 
        const checkSourceData = await this.fieldsValuesRepository.query(createSourceFields);
        if (checkSourceData.length == 0) {
            return false
        }
    }

    async updateSourceDetailsTableFields(tableName: string, name: string, value: string, controllingfieldfk?: string) {

        let updateSourceDetails = `UPDATE public.${tableName} SET name='${name}'`;

        if (controllingfieldfk !== undefined) {
            updateSourceDetails += `, controllingfieldfk='${controllingfieldfk}'`;
        }

        updateSourceDetails += ` WHERE value='${value}';`;
        const updateSourceData = await this.fieldsValuesRepository.query(updateSourceDetails);
        if (updateSourceData.length == 0) {
            return false
        }
    }

    // Changing this function to fetch Fields for Context and contextType to be null
    async getFieldIds(context: string, contextType?: string) {

        const condition: any = [
            // Condition from function parameters
            {
                context: context,
                contextType: contextType ? contextType : IsNull()
            },
            // Always include this condition to fetch  Values with context and contextType as Null
            {
                context: IsNull(),
                contextType: IsNull()
            }
        ];

        let result = await this.fieldsRepository.find({
            where: condition,
            select: ["fieldId"]
        });

        return result;
    }

    async getFieldByIdes(fieldId: string) {
        try {
            const response = await this.fieldsRepository.findOne({
                where: { fieldId: fieldId }
            });
            return response;
        } catch (e) {
            return { error: e }
        }
    }




    async searchFields(
        tenantId: string,
        request: any,
        fieldsSearchDto: FieldsSearchDto,
        response: Response
    ) {
        const apiId = APIID.FIELDS_SEARCH;
        try {
            let { limit, offset, filters } = fieldsSearchDto;
            limit = limit ? limit : 20;
            offset = offset ? offset : 0;

            const fieldKeys = this.fieldsRepository.metadata.columns.map(
                (column) => column.propertyName
            );
            let whereClause = `"tenantId" = '${tenantId}'`;
            if (filters && Object.keys(filters).length > 0) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (fieldKeys.includes(key)) {
                        if (key === 'context' && (value === 'USERS' || value === 'COHORT')) {
                            whereClause += ` AND "context" = '${value}'`;
                        } else {
                            whereClause += ` AND "${key}" = '${value}'`;
                        }
                    } else {
                        return APIResponse.error(
                            response,
                            apiId,
                            "BAD_REQUEST",
                            `Invalid Filter Entered : ${key}`,
                            HttpStatus.BAD_REQUEST
                        );
                    }
                });
            }
            let fieldData = await this.getFieldData(whereClause);
            if (!fieldData.length) {
                return APIResponse.error(
                    response,
                    apiId,
                    "NOT_FOUND",
                    `Fields not found for the search term`,
                    HttpStatus.NOT_FOUND
                );
            }
            return APIResponse.success(
                response,
                apiId,
                fieldData,
                HttpStatus.OK,
                "Fields fetched successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "Internal Server Error",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async searchFieldData(offset: number, limit: string, searchData: any) {
        let queryOptions: any = {
            where: searchData,
        };

        if (offset !== undefined) {
            queryOptions.skip = offset;
        }

        if (limit !== undefined) {
            queryOptions.take = parseInt(limit);
        }


        const [results, totalCount] = await this.fieldsRepository.findAndCount(queryOptions);

        const mappedResponse = await this.mappedResponseField(results);
        return { mappedResponse, totalCount };
    }

    async createFieldValues(request: any, fieldValuesDto: FieldValuesDto, res: Response) {
        const apiId = APIID.FIELDVALUES_CREATE;

        try {
            let result = await this.findAndSaveFieldValues(fieldValuesDto);
            if (!result) {
                APIResponse.error(
                    res,
                    apiId,
                    `Fields not found or already exist`,
                    `Fields not found or already exist`,
                    (HttpStatus.NOT_FOUND)
                )

            }
            return APIResponse.success(res, apiId, result, (HttpStatus.CREATED), "Field Values created successfully");


        } catch (error) {
            const errorMessage = error.message || 'Something went wrong';
            return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, (HttpStatus.INTERNAL_SERVER_ERROR));

        }
    }

    async searchFieldValues(request: any, fieldValuesSearchDto: FieldValuesSearchDto, response: Response) {
        const apiId = APIID.FIELDVALUES_SEARCH;
        try {
            const getConditionalData = await this.search(fieldValuesSearchDto)
            const offset = getConditionalData.offset;
            const limit = getConditionalData.limit;
            const whereClause = getConditionalData.whereClause;

            const getFieldValue = await this.getSearchFieldValueData(offset, limit, whereClause)

            const result = {
                totalCount: getFieldValue.totalCount,
                fields: getFieldValue.mappedResponse,
            }

            return await APIResponse.success(response, apiId, result,
                HttpStatus.OK, 'Field Values fetched successfully.')

        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    async getSearchFieldValueData(offset: number, limit: string, searchData: any) {
        let queryOptions: any = {
            where: searchData,
        };

        if (offset !== undefined) {
            queryOptions.skip = offset;
        }

        if (limit !== undefined) {
            queryOptions.take = parseInt(limit);
        }

        const [results, totalCount] = await this.fieldsValuesRepository.findAndCount(queryOptions);
        const mappedResponse = await this.mappedResponse(results);

        return { mappedResponse, totalCount };

    }


    async searchFieldValueId(fieldId: string, itemId?: string) {
        const whereClause: any = { fieldId: fieldId };
        if (itemId) {
            whereClause.itemId = itemId;
        }

        const response = await this.fieldsValuesRepository.findOne({
            where: whereClause,
        });
        return response;
    }

    async updateFieldValues(id: string, fieldValuesUpdateDto: FieldValuesUpdateDto) {

        try {
            const fieldsData: any = {};
            Object.keys(fieldValuesUpdateDto).forEach((e) => {
                if (fieldValuesUpdateDto[e] && fieldValuesUpdateDto[e] != "") {
                    if (Array.isArray(fieldValuesUpdateDto[e])) {
                        fieldsData[e] = JSON.stringify(fieldValuesUpdateDto[e]);
                    } else {
                        fieldsData[e] = fieldValuesUpdateDto[e];
                    }
                }
            });
            const response = await this.fieldsValuesRepository.update(id, fieldValuesUpdateDto);

            return response;
        } catch (e) {
            return new ErrorResponse({
                errorCode: "400",
                errorMessage: e,
            });
        }
    }

    public async getFieldsAndFieldsValues(cohortId: string) {
        let query = `SELECT FV."value",FV."itemId", FV."fieldId", F."name" AS fieldname, F."label", F."context",F."type", F."state", F."contextType", F."fieldParams" FROM public."FieldValues" FV 
        LEFT JOIN public."Fields" F
        ON FV."fieldId" = F."fieldId" where FV."itemId" =$1`;
        const results = await this.fieldsValuesRepository.query(query, [cohortId]);
        return results;
    }

    public async mappedResponse(result: any) {
        const fieldValueResponse = result.map((item: any) => {
            const fieldValueMapping = {
                value: item?.value ? `${item.value}` : "",
                fieldValuesId: item?.fieldValuesId ? `${item.fieldValuesId}` : "",
                itemId: item?.itemId ? `${item.itemId}` : "",
                fieldId: item?.fieldId ? `${item.fieldId}` : "",
                createdAt: item?.createdAt ? `${item.createdAt}` : "",
                updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
                createdBy: item?.createdBy ? `${item.createdBy}` : "",
                updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
            };

            return new FieldValuesDto(fieldValueMapping);
        });

        return fieldValueResponse;
    }

    public async mappedResponseField(result: any) {
        const fieldResponse = result.map((item: any) => {

            const fieldMapping = {
                fieldId: item?.fieldId ? `${item.fieldId}` : "",
                assetId: item?.assetId ? `${item.assetId}` : "",
                context: item?.context ? `${item.context}` : "",
                groupId: item?.groupId ? `${item.groupId}` : "",
                name: item?.name ? `${item.name}` : "",
                label: item?.label ? `${item.label}` : "",
                defaultValue: item?.defaultValue ? `${item.defaultValue}` : "",
                type: item?.type ? `${item.type}` : "",
                note: item?.note ? `${item.note}` : "",
                description: item?.description ? `${item.description}` : "",
                state: item?.state ? `${item.state}` : "",
                required: item?.required ? `${item.required}` : "",
                ordering: item?.ordering ? `${item.ordering}` : "",
                metadata: item?.metadata ? `${item.metadata}` : "",
                access: item?.access ? `${item.access}` : "",
                onlyUseInSubform: item?.onlyUseInSubform ? `${item.onlyUseInSubform}` : "",
                tenantId: item?.tenantId ? `${item.tenantId}` : "",
                createdAt: item?.createdAt ? `${item.createdAt}` : "",
                updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
                createdBy: item?.createdBy ? `${item.createdBy}` : "",
                updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
                contextId: item?.contextId ? `${item.contextId}` : "",
                render: item?.render ? `${item.render}` : "",
                contextType: item?.contextType ? `${item.contextType}` : "",
                fieldParams: item?.fieldParams ? JSON.stringify(item.fieldParams) : ""
            };

            return new FieldsDto(fieldMapping);
        });

        return fieldResponse;
    }

    public async findAndSaveFieldValues(fieldValuesDto: FieldValuesDto) {

        const checkFieldValueExist = await this.fieldsValuesRepository.find({
            where: { itemId: fieldValuesDto.itemId, fieldId: fieldValuesDto.fieldId },
        });

        if (checkFieldValueExist.length == 0) {

            const result = await this.fieldsValuesRepository.save(fieldValuesDto);

            return result;
        }
        return false;
    }


    public async search(dtoFileName) {
        let { limit, page, filters } = dtoFileName;

        let offset = 0;
        if (page > 1) {
            offset = parseInt(limit) * (page - 1);
        }

        if (limit.trim() === '') {
            limit = '0';
        }

        const whereClause = {};
        if (filters && Object.keys(filters).length > 0) {
            Object.entries(filters).forEach(([key, value]) => {
                whereClause[key] = value;
            });
        }
        return { offset, limit, whereClause };
    }

    //Get all fields options
    public async getFieldOptions(fieldsOptionsSearchDto: FieldsOptionsSearchDto, response: Response) {

        const apiId = APIID.FIELDVALUES_SEARCH;
        try {
            let dynamicOptions;
            let { fieldName, controllingfieldfk, context, contextType, offset, limit, sort, optionName } = fieldsOptionsSearchDto

            offset = offset ? offset : 0;
            limit = limit ? limit : 200;

            const condition: any = {
                name: fieldName
            };

            if (context) {
                condition.context = context;
            }

            if (contextType) {
                condition.contextType = contextType;
            }

            const fetchFieldParams = await this.fieldsRepository.findOne({
                where: condition
            })

            let order;
            if (sort && sort.length) {
                order = `ORDER BY ${sort[0]} ${sort[1]}`
            } else {
                order = `ORDER BY name ASC`
            }

            if (fetchFieldParams?.sourceDetails?.source === 'table') {
                let whereClause;
                if (controllingfieldfk) {
                    whereClause = `"controllingfieldfk" = '${controllingfieldfk}'`;
                }

                dynamicOptions = await this.findDynamicOptions(fieldName, whereClause, offset, limit, order, optionName);
            } else if (fetchFieldParams?.sourceDetails?.source === 'jsonFile') {
                const filePath = path.join(
                    process.cwd(),
                    `${fetchFieldParams.sourceDetails.filePath}`,
                );
                let getFieldValuesFromJson = JSON.parse(readFileSync(filePath, 'utf-8'));

                if (controllingfieldfk) {
                    dynamicOptions = getFieldValuesFromJson.options.filter(option => (option?.controllingfieldfk === controllingfieldfk))
                } else {
                    dynamicOptions = getFieldValuesFromJson;
                }

            } else {
                fetchFieldParams.fieldParams['options'] && controllingfieldfk ?
                    dynamicOptions = fetchFieldParams?.fieldParams['options'].filter((option: any) => option?.controllingfieldfk === controllingfieldfk) :
                    dynamicOptions = fetchFieldParams?.fieldParams['options'];
            }

            return await APIResponse.success(response, apiId, dynamicOptions,
                HttpStatus.OK, 'Field Values fetched successfully.')
        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
        }

    }

    public async deleteFieldOptions(requiredData, response) {
        const apiId = APIID.FIELD_OPTIONS_DELETE;
        try {
            let result;
            const condition: any = {
                name: requiredData.fieldName,
            };

            // If `context` and `contextType` are not provided, in that case check those fields where both `context` and `contextType` are null.
            let removeOption = requiredData.option !== null ? requiredData.option : null;
            condition.context = requiredData.context !== null ? requiredData.context : In([null, 'null', 'NULL']);
            condition.contextType = requiredData.contextType !== null ? requiredData.contextType : In([null, 'null', 'NULL']);

            let getField = await this.fieldsRepository.findOne({
                where: condition
            })

            if (getField) {
                //Delete data from source table
                if (getField?.sourceDetails?.source == 'table') {
                    let whereCond = requiredData.option ? `WHERE "value"='${requiredData.option}'` : '';
                    let query = `DELETE FROM public.${getField?.sourceDetails?.table} ${whereCond}`
                    let deleteData = await this.fieldsRepository.query(query);
                }
                //Delete data from fieldParams column
                if (getField?.sourceDetails?.source == 'fieldparams') {

                    // check options exits in fieldParams column or not
                    const query = `SELECT * FROM public."Fields" WHERE "fieldId"='${getField.fieldId}' AND "fieldParams" -> 'options' @> '[{"value": "${removeOption}"}]' `;
                    let checkSourceData = await this.fieldsRepository.query(query);

                    if (checkSourceData.length > 0) {
                        let fieldParamsOptions = checkSourceData[0].fieldParams.options;

                        let fieldParamsData: any = {}
                        if (fieldParamsOptions) {
                            fieldParamsOptions = fieldParamsOptions.filter(option => option.name !== removeOption);
                        }
                        fieldParamsData = fieldParamsOptions.length > 0 ? { options: fieldParamsOptions } : null

                        result = await this.fieldsRepository.update({ fieldId: getField.fieldId }, { fieldParams: fieldParamsData });

                    } else {
                        return await APIResponse.error(response, apiId, `Fields option not found`, `Fields option not found`, (HttpStatus.NOT_FOUND))
                    }

                }
            } else {
                return await APIResponse.error(response, apiId, `Fields not found.`, `NOT FOUND`, (HttpStatus.NOT_FOUND))
            }
            return await APIResponse.success(response, apiId, result,
                HttpStatus.OK, 'Field Options deleted successfully.')
        } catch (e) {
            const errorMessage = e?.message || 'Something went wrong';
            return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    async findDynamicOptions(tableName, whereClause?: {}, offset?: {}, limit?: {}, order?: {}, optionName?: {}) {
        let query: string;
        let result;

        let orderCond = order ? order : '';
        let offsetCond = offset ? `offset ${offset}` : '';
        let limitCond = limit ? `limit ${limit}` : '';
        let whereCond = `WHERE`;
        whereCond = whereClause ? whereCond += `${whereClause}` : '';

        if (optionName) {
            if (whereCond) {
                whereCond += `name ILike '%${optionName}%'`
            } else {
                whereCond += `WHERE "name" ILike '%${optionName}%'`
            }
        } else {
            whereCond += ''
        }

        query = `SELECT * FROM public."${tableName}" ${whereCond} ${orderCond} ${offsetCond} ${limitCond}`

        result = await this.fieldsRepository.query(query);
        if (!result) {
            return null;
        }

        return result.map(result => ({
            value: result.value,
            label: result.name
        }));
    }
    async findCustomFields(context: string, contextType?: string[], getFields?: string[]) {
        const condition: any = {
            context,
            ...(contextType?.length ? { contextType: In(contextType.filter(Boolean)) } : {}),
            ...(getFields?.includes('All') ? {} : getFields?.length ? { name: In(getFields.filter(Boolean)) } : {})
        };

        const validContextTypes = contextType?.filter(Boolean);
        if (validContextTypes?.length) {
            condition.contextType = In(validContextTypes);
        } else {
            condition.contextType = IsNull();
        }

        const customFields = await this.fieldsRepository.find({ where: condition });
        return customFields;
    }


    async findFieldValues(contextId: string, context: string) {
        let query = "";
        if (context === "COHORT") {
            query = `SELECT C."cohortId",F."fieldId",F."value" FROM public."Cohort" C 
    LEFT JOIN public."FieldValues" F
    ON C."cohortId" = F."itemId" where C."cohortId" =$1`;
        } else if (context === "USERS") {
            query = `SELECT U."userId",F."fieldId",F."value" FROM public."Users" U 
    LEFT JOIN public."FieldValues" F
    ON U."userId" = F."itemId" where U."userId" =$1`;
        }

        let result = await this.fieldsRepository.query(query, [contextId]);
        return result;
    }

    async filterUserUsingCustomFields(context: string, stateDistBlockData: any) {
        let searchKey = [];
        let whereCondition = ` WHERE `;
        let index = 0;

        for (const [key, value] of Object.entries(stateDistBlockData)) {
            searchKey.push(`'${key}'`);
            if (index > 0) {
                whereCondition += ` AND `
            }
            whereCondition += `fields->>'${key}' = '${value}'`
            index++;
        }

        let query = `WITH user_fields AS (
        SELECT
            fv."itemId",
            jsonb_object_agg(f."name", fv."value") AS fields
        FROM "FieldValues" fv
        JOIN "Fields" f ON fv."fieldId" = f."fieldId"
        WHERE f."name" IN (${searchKey}) AND f.context = '${context}'
        GROUP BY fv."itemId"
        )
        SELECT "itemId"
        FROM user_fields ${whereCondition}`

        console.log(query);

        const queryData = await this.fieldsValuesRepository.query(query);
        const result = queryData.length > 0 ? queryData.map(item => item.itemId) : null;

        return result
    }

    async getFieldValuesData(id: string, context: string, contextType?: string, getFields?: string[], requiredFieldOptions?: Boolean) {

        let customField;
        let fieldsArr = [];
        const [filledValues, customFields] = await Promise.all([
            this.findFieldValues(id, context),
            this.findCustomFields(context, [contextType], getFields)
        ]);
        const filledValuesMap = new Map(filledValues.map(item => [item.fieldId, item.value]));
        if (customFields) {
            for (let data of customFields) {
                const fieldValue = filledValuesMap.get(data?.fieldId);
                customField = {
                    fieldId: data?.fieldId,
                    name: data?.name,
                    label: data?.label,
                    order: data?.ordering,
                    isRequired: data?.fieldAttributes?.isRequired,
                    isEditable: data?.fieldAttributes?.isEditable,
                    isMultiSelect: data.fieldAttributes ? data.fieldAttributes['isMultiSelect'] : '',
                    maxSelections: data.fieldAttributes ? data.fieldAttributes['maxSelections'] : '',
                    type: data?.type || '',
                    value: fieldValue || '',
                };

                if (requiredFieldOptions == true && (data?.dependsOn == '' || data?.dependsOn == undefined)) {
                    if (data?.sourceDetails?.source === 'table') {
                        let dynamicOptions = await this.findDynamicOptions(data?.sourceDetails?.table);
                        customField.options = dynamicOptions;
                    } else if (data?.sourceDetails?.source === 'jsonFile') {
                        const filePath = path.join(
                            process.cwd(),
                            `${data?.sourceDetails?.filePath}`,
                        );
                        customField = JSON.parse(readFileSync(filePath, 'utf-8'));
                    } else {
                        customField.options = data?.fieldParams?.['options'] || null;
                    }
                } else {
                    customField.options = null;
                }
                fieldsArr.push(customField);
            }
        }

        return fieldsArr;
    }

    async getEditableFieldsAttributes() {
        const getFieldsAttributesQuery = `
          SELECT * 
          FROM "public"."Fields" 
          WHERE "fieldAttributes"->>'isEditable' = $1 
        `;
        const getFieldsAttributesParams = ['true'];
        return await this.fieldsRepository.query(getFieldsAttributesQuery, getFieldsAttributesParams);
    }

    async updateCustomFields(itemId, data, fieldAttributesAndParams) {

        if (Array.isArray(data.value)) {
            data.value = data.value.join(',')
        }

        let result: any = await this.fieldsValuesRepository.update({ itemId, fieldId: data.fieldId }, { value: data.value });
        let newResult;
        if (result.affected === 0) {
            newResult = await this.fieldsValuesRepository.save({
                itemId,
                fieldId: data.fieldId,
                value: data.value
            });
        }
        Object.assign(result, newResult);
        result["correctValue"] = true;
        return result;
    }

    validateFieldValue(field: any, value: any) {
        try {
            const fieldInstance = FieldFactory.createField(field.type, field.fieldAttributes, field.fieldParams);
            const isValid = fieldInstance.validate(value);
            return isValid;
        } catch (e) {
            return { error: e }
        }
    }

    getFieldValueForMultiselect(isMultiSelect: boolean, fieldValue: any) {
        if (isMultiSelect) {
            return fieldValue.split(",");
        }
        return fieldValue;
    }

    mappedFields(fieldDataList) {
        const mappedFields: SchemaField[] = fieldDataList.map((field) => {
            const options = field.fieldParams?.options?.map((opt) => ({
                label: opt.label,
                value: opt.value,
            })) || [];

            return {
                label: field.label,
                name: field.name,
                type: field.type,
                coreField: 0,
                isRequired: field?.fieldAttributes?.isRequired || false,
                isEditable: field.fieldAttributes?.isEditable ?? null,
                isPIIField: field.fieldAttributes?.isPIIField ?? null,
                placeholder: field.fieldAttributes?.placeholder ?? '',
                validation: field.fieldAttributes?.validation || [],
                options: options,
                isMultiSelect: field.fieldAttributes?.isMultiSelect ?? false,
                maxSelections: field.fieldAttributes?.maxSelections ?? null,
                hint: field.fieldAttributes?.hint || null,
                pattern: field?.fieldAttributes?.pattern ?? null,
                maxLength: field.maxLength ?? null,
                minLength: field.minLength ?? null,
                fieldId: field.fieldId ?? null,
                dependsOn: field.dependsOn ?? false,
                sourceDetails: field.sourceDetails ?? null,
            };
        });
        return mappedFields;
    }
}