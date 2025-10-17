import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { FieldsDto } from "src/fields/dto/fields.dto";
import {
  FieldsOptionsSearchDto,
  FieldsSearchDto,
} from "src/fields/dto/fields-search.dto";
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
import path, { join } from "path";
import { FieldFactory } from "src/fields/fieldValidators/fieldFactory";
import { FieldsUpdateDto } from "src/fields/dto/fields-update.dto";
import { SchemaField, Option } from "src/fields/fieldValidators/fieldClass";
import jwt_decode from "jwt-decode";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { API_RESPONSES } from "@utils/response.messages";
import { FieldValuesDeleteDto } from "src/fields/dto/field-values-delete.dto";
import { check } from "prettier";
@Injectable()
export class PostgresFieldsService implements IServicelocatorfields {
  constructor(
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldsValuesRepository: Repository<FieldValues>
  ) { }

  async getFormCustomField(requiredData, response) {
    const apiId = "FormData";
    try {
      let whereClause = '(context IS NULL AND "contextType" IS NULL)';
      const fileread = readFileSync(
        join(process.cwd(), "src/utils/corefield.json"),
        "utf8"
      );
      const corefield = JSON.parse(fileread);
      if (!requiredData.context && !requiredData.contextType) {
        const result = [...corefield.users, ...corefield.cohort];
        const data = await this.getFieldData(whereClause);
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

      const data = await this.getFieldData(whereClause);
      if (!data) {
        return APIResponse.error(
          response,
          apiId,
          "NOT_FOUND",
          `Fields not found for the search term`,
          HttpStatus.NOT_FOUND
        );
      }
      if (
        requiredData.context === "USERS" ||
        requiredData.context === "COHORT"
      ) {
        const coreFields = corefield[requiredData.context.toLowerCase()];
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
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );

      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //validate cohort Create/update API Custom field
  public async validateCustomField(cohortCreateDto, contextType) {
    const tenantId = cohortCreateDto?.tenantId;
    const fieldValues = cohortCreateDto ? cohortCreateDto.customFields : [];
    const encounteredKeys = [];
    const invalidateFields = [];
    const duplicateFieldKeys = [];
    const error = "";

    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData["fieldId"];
      const getFieldDetails: any = await this.getFieldByIds(fieldId);

      if (getFieldDetails == null) {
        return {
          isValid: false,
          error: `Field not found ${fieldId}`,
        };
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails["name"]}`);
      } else {
        encounteredKeys.push(fieldId);
      }
      const fieldAttributes = getFieldDetails?.fieldAttributes || {};
      // getFieldDetails["fieldAttributes"] = fieldAttributes[tenantId] || fieldAttributes["default"];
      getFieldDetails["fieldAttributes"] = fieldAttributes;

      if (
        (getFieldDetails.type == "checkbox" ||
          getFieldDetails.type == "drop_down" ||
          getFieldDetails.type == "radio") &&
        getFieldDetails.sourceDetails.source == "table"
      ) {
        let fieldValue = fieldsData["value"][0];
        const getOption = await this.findDynamicOptions(
          getFieldDetails.sourceDetails.table,
          `"${getFieldDetails?.sourceDetails?.table}_id"='${fieldValue}'`
        );
        const transformedFieldParams = {
          options: getOption.flatMap((param) => {
            return Object.keys(param)
              .filter((key) => key.endsWith("_id"))
              .map((idKey) => {
                const nameKey = idKey.replace("_id", "_name");
                return {
                  value: param[idKey],
                  label: param[nameKey] || "Unknown",
                };
              });
          }),
        };
        getFieldDetails["fieldParams"] = transformedFieldParams;
      } else {
        getFieldDetails["fieldParams"] = getFieldDetails?.fieldParams ?? {};
      }
      const checkValidation = this.validateFieldValue(
        getFieldDetails,
        fieldsData["value"]
      );
      if (typeof checkValidation === "object" && "error" in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails["name"]} - ${checkValidation?.error?.message}`
        );
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
    const context = "COHORT";
    const getFieldIds = await this.getFieldIds(context, contextType);
    const validFieldIds = new Set(getFieldIds.map((field) => field.fieldId));
    const invalidFieldIds = cohortCreateDto.customFields
      .filter((fieldValue) => !validFieldIds.has(fieldValue.fieldId))
      .map((fieldValue) => fieldValue.fieldId);

    if (invalidFieldIds.length > 0) {
      return {
        isValid: false,
        error: `The following fields are not valid for this user: ${invalidFieldIds.join(
          ", "
        )}.`,
      };
    }
    return {
      isValid: true,
    };
  }
  //validate custom fields by context and contextType
  public async validateCustomFieldByContext(
    cohortCreateDto,
    context: string,
    contextType: string
  ) {
    const fieldValues = cohortCreateDto ? cohortCreateDto.customFields : [];
    const encounteredKeys = [];
    const invalidateFields = [];
    const duplicateFieldKeys = [];
    const error = "";

    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData["fieldId"];
      const getFieldDetails: any = await this.getFieldByIds(fieldId);

      if (getFieldDetails == null) {
        return {
          isValid: false,
          error: `Field not found`,
        };
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails["name"]}`);
      } else {
        encounteredKeys.push(fieldId);
      }

      if (
        (getFieldDetails.type == "checkbox" ||
          getFieldDetails.type == "drop_down" ||
          getFieldDetails.type == "radio") &&
        getFieldDetails.sourceDetails.source == "table"
      ) {
        const getOption = await this.findDynamicOptions(
          getFieldDetails.sourceDetails.table
        );
        const transformedFieldParams = {
          options: getOption.map((param) => ({
            value: param.value,
            label: param.label,
          })),
        };
        getFieldDetails["fieldParams"] = transformedFieldParams;
      } else {
        getFieldDetails["fieldParams"] = getFieldDetails?.fieldParams ?? {};
      }

      const checkValidation = this.validateFieldValue(
        getFieldDetails,
        fieldsData["value"]
      );

      if (typeof checkValidation === "object" && "error" in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails["name"]} - ${checkValidation?.error?.message}`
        );
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
    const getFieldIds = await this.getFieldIds(context, contextType);

    const validFieldIds = new Set(getFieldIds.map((field) => field.fieldId));

    const invalidFieldIds = cohortCreateDto.customFields
      .filter((fieldValue) => !validFieldIds.has(fieldValue.fieldId))
      .map((fieldValue) => fieldValue.fieldId);

    if (invalidFieldIds.length > 0) {
      return {
        isValid: false,
        error: `The following fields are not valid for this user: ${invalidFieldIds.join(
          ", "
        )}.`,
      };
    }
    return {
      isValid: true,
    };
  }

  async getFieldData(whereClause: any, tenantId?: string): Promise<any> {
    const query = `select * from public."Fields" where ${whereClause}`;

    const result = await this.fieldsRepository.query(query);
    if (!result) {
      return false;
    }
    for (const data of result) {
      if (
        ((data?.dependsOn == "" ||
          data?.dependsOn == undefined ||
          data?.dependsOn == null) &&
          data?.sourceDetails?.source === "table") ||
        data?.sourceDetails?.source === "jsonfile"
      ) {
        const options = await this.findDynamicOptions(data.sourceDetails.table);
        data.fieldParams = data.fieldParams || {};
        data.fieldParams.options = options;
      }
    }

    const schema = this.mappedFields(result, tenantId);
    return schema;
  }

  async createFields(request: any, fieldsDto: FieldsDto, response: Response) {
    const apiId = APIID.FIELDS_CREATE;
    try {
      const fieldsData: any = {}; // Define an empty object to store field data
      const decoded: any = jwt_decode(request.headers.authorization);
      const createdBy = decoded?.sub;
      const updatedBy = decoded?.sub;

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
      fieldsData["required"] = true;

      const checkFieldExist = await this.fieldsRepository.find({
        where: {
          context: fieldsData.context,
          contextType: fieldsData.contextType,
          name: fieldsData.name,
        },
      });
      if (checkFieldExist.length > 0) {
        APIResponse.error(
          response,
          apiId,
          `Fields already exist`,
          `CONFLICT`,
          HttpStatus.CONFLICT
        );
      }

      const storeWithoutControllingField = [];
      let error = "";
      if (
        fieldsData.sourceDetails &&
        fieldsData.sourceDetails.source == "table" &&
        fieldsData.fieldParams
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          if (
            fieldsData.dependsOn &&
            (!sourceFieldName["controllingfieldfk"] ||
              sourceFieldName["controllingfieldfk"] === "")
          ) {
            storeWithoutControllingField.push(sourceFieldName["name"]);
          }

          const query = `SELECT "name", "value" 
          FROM public.${fieldsData.sourceDetails.table} 
          WHERE value = '${sourceFieldName["value"]}' 
          GROUP BY  "name", "value"`;

          const checkSourceData = await this.fieldsValuesRepository.query(
            query
          );

          //If code is not exist in db
          if (checkSourceData.length === 0) {
            //If code is not exist in db and isCreate flag is false
            if (!fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                "BAD_REQUEST",
                `Error: This code '${sourceFieldName["value"]}' does not exist in the '${fieldsData.sourceDetails.table}' table.`,
                HttpStatus.BAD_REQUEST
              );
            }

            // If not exist and isCreate is true, create the record
            await this.createSourceDetailsTableFields(
              fieldsData.sourceDetails.table,
              sourceFieldName["name"],
              sourceFieldName["value"],
              createdBy,
              sourceFieldName["controllingfieldfk"],
              fieldsData.dependsOn
            );
          } else {
            //If code is exist in db and isCreate flag is true
            if (fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                "CONFLICT",
                `Error: This code '${sourceFieldName["value"]}' already exists for '${checkSourceData[0].name}' in the '${fieldsData.sourceDetails.table}' table.`,
                HttpStatus.CONFLICT
              );
            }

            // If exist and isCreate is false, update the record
            await this.updateSourceDetailsTableFields(
              fieldsData.sourceDetails.table,
              sourceFieldName["name"],
              sourceFieldName["value"],
              updatedBy,
              sourceFieldName["controllingfieldfk"]
            );
          }
        }
        delete fieldsData.fieldParams;
      }

      if (storeWithoutControllingField.length > 0) {
        const wrongControllingField = storeWithoutControllingField.join(",");
        error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`;
      }

      const result = await this.fieldsRepository.save(fieldsData);

      return await APIResponse.success(
        response,
        apiId,
        { result, error },
        HttpStatus.CREATED,
        "Fields created successfully."
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async updateFields(
    fieldId: any,
    request: any,
    fieldsUpdateDto: FieldsUpdateDto,
    response: Response
  ) {
    const apiId = APIID.FIELDS_CREATE;
    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      const createdBy = decoded?.sub;
      const updatedBy = decoded?.sub;

      const fieldsData: any = {}; // Define an empty object to store field data
      const storeWithoutControllingField = [];
      let error = "";

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
        where: { fieldId: fieldId },
      });

      fieldsData["type"] = fieldsData.type || getSourceDetails.type;

      //Update field options
      //Update data in source table
      if (
        getSourceDetails.sourceDetails &&
        fieldsData.fieldParams &&
        fieldsData.fieldParams.options &&
        getSourceDetails.sourceDetails.source == "table"
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          if (
            getSourceDetails.dependsOn &&
            (!sourceFieldName["controllingfieldfk"] ||
              sourceFieldName["controllingfieldfk"] === "")
          ) {
            storeWithoutControllingField.push(sourceFieldName["name"]);
          }

          // check options exits in source table column or not
          const query = `SELECT "name", "value" 
          FROM public.${getSourceDetails.sourceDetails.table} 
          WHERE value = '${sourceFieldName["value"]}' 
          GROUP BY  "name", "value"`;

          const checkSourceData = await this.fieldsValuesRepository.query(
            query
          );

          //If code is not exist in db
          if (checkSourceData.length === 0) {
            //If code is not exist in db and isCreate flag is false
            if (!fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                "BAD_REQUEST",
                `Error: This code '${sourceFieldName["value"]}' does not exist in the '${getSourceDetails.sourceDetails.table}' table.`,
                HttpStatus.BAD_REQUEST
              );
            }

            // If not exist and isCreate is true, create the record
            await this.createSourceDetailsTableFields(
              getSourceDetails.sourceDetails.table,
              sourceFieldName["name"],
              sourceFieldName["value"],
              createdBy,
              sourceFieldName["controllingfieldfk"],
              getSourceDetails.dependsOn
            );
          } else {
            //If code is exist in db and isCreate flag is true
            if (fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                "CONFLICT",
                `Error: This code '${sourceFieldName["value"]}' already exists for '${checkSourceData[0].name}' in the '${getSourceDetails.sourceDetails.table}' table.`,
                HttpStatus.CONFLICT
              );
            }

            // If exist and isCreate is false, update the record
            await this.updateSourceDetailsTableFields(
              getSourceDetails.sourceDetails.table,
              sourceFieldName["name"],
              sourceFieldName["value"],
              updatedBy,
              sourceFieldName["controllingfieldfk"]
            );
          }
        }
        delete fieldsData.fieldParams;
      }

      //Update data in field params
      if (
        getSourceDetails.sourceDetails &&
        getSourceDetails.sourceDetails.source == "fieldparams"
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          //Store those fields is depends on another fields but did not provide controlling field foreign key
          if (
            fieldsData.dependsOn &&
            (!sourceFieldName["controllingfieldfk"] ||
              sourceFieldName["controllingfieldfk"] === "")
          ) {
            storeWithoutControllingField.push(sourceFieldName["name"]);
          }

          // check options exits in fieldParams column or not
          const query = `SELECT COUNT(*) FROM public."Fields" WHERE "fieldId"='${fieldId}' AND "fieldParams" -> 'options' @> '[{"value": "${sourceFieldName["value"]}"}]' `;
          const checkSourceData = await this.fieldsRepository.query(query);

          //If fields is not present then create a new options
          if (checkSourceData[0].count == 0) {
            const addFieldParamsValue = await this.addOptionsInFieldParams(
              fieldId,
              sourceFieldName
            );
            if (addFieldParamsValue !== true) {
              return APIResponse.error(
                response,
                apiId,
                "Internal Server Error",
                `Error : ${addFieldParamsValue}`,
                HttpStatus.INTERNAL_SERVER_ERROR
              );
            }
          }
        }
      }

      //If fields is depends on another fields but did not provide controlling field foreign key
      if (storeWithoutControllingField.length > 0) {
        const wrongControllingField = storeWithoutControllingField.join(",");
        error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`;
      }

      const result = await this.fieldsRepository.update(fieldId, fieldsData);
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        "Fields updated successfully."
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async addOptionsInFieldParams(fieldId: string, newParams: any) {
    try {
      const existingField = await this.fieldsRepository.findOne({
        where: { fieldId },
      });

      //get existing fields which are present in out database
      const existingOptions =
        existingField.fieldParams !== null
          ? existingField.fieldParams["options"]
          : [];
      const newOption = newParams;

      //merge new fields and old fields
      const updatedOptions = [...existingOptions, newOption];
      const fieldParams = { options: updatedOptions };
      existingField.fieldParams = fieldParams;

      await this.fieldsRepository.update(fieldId, {
        fieldParams: existingField.fieldParams,
      });
      return true;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return errorMessage;
    }
  }

  async createSourceDetailsTableFields(
    tableName: string,
    name: string,
    value: string,
    createdBy: string,
    controllingfieldfk?: string,
    dependsOn?: string
  ) {
    let createSourceFields = `INSERT INTO public.${tableName} ("name", "value", "createdBy"`;

    // Add controllingfieldfk to the columns if it is defined
    if (controllingfieldfk !== undefined && controllingfieldfk !== "") {
      createSourceFields += `, controllingfieldfk`;
    }

    createSourceFields += `) VALUES ('${name}', '${value}', '${createdBy}'`;

    // Add controllingfieldfk to the values if it is defined
    if (controllingfieldfk !== undefined && controllingfieldfk !== "") {
      createSourceFields += `, '${controllingfieldfk}'`;
    }

    createSourceFields += `);`;

    if (dependsOn && (!controllingfieldfk || controllingfieldfk === "")) {
      return false;
    }

    //Insert data into source table
    const checkSourceData = await this.fieldsValuesRepository.query(
      createSourceFields
    );
    if (checkSourceData.length == 0) {
      return false;
    }
  }

  async updateSourceDetailsTableFields(
    tableName: string,
    name: string,
    value: string,
    updatedBy: string,
    controllingfieldfk?: string
  ) {
    let updateSourceDetails = `UPDATE public.${tableName} SET "name"='${name}',"updatedBy"='${updatedBy}'`;

    if (controllingfieldfk !== undefined) {
      updateSourceDetails += `, controllingfieldfk='${controllingfieldfk}'`;
    }

    updateSourceDetails += ` WHERE value='${value}';`;

    const updateSourceData = await this.fieldsValuesRepository.query(
      updateSourceDetails
    );
    if (updateSourceData.length == 0) {
      return false;
    }
  }

  // Changing this function to fetch Fields for Context and contextType to be null
  async getFieldIds(context: string, contextType?: string) {
    const condition: any = [
      // Condition from function parameters
      {
        context: context,
        contextType: contextType ? contextType : IsNull(),
      },
      // Always include this condition to fetch  Values with context and contextType as Null
      {
        context: IsNull(),
        contextType: IsNull(),
      },
    ];

    const result = await this.fieldsRepository.find({
      where: condition,
      select: ["fieldId"],
    });

    return result;
  }

  async getFieldByIds(fieldId: string) {
    try {
      const response = await this.fieldsRepository.findOne({
        where: { fieldId: fieldId },
      });
      return response;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      return { error: e };
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
      let { limit, offset } = fieldsSearchDto;
      const { filters } = fieldsSearchDto;
      limit = limit ? limit : 20;
      offset = offset ? offset : 0;

      const fieldKeys = this.fieldsRepository.metadata.columns.map(
        (column) => column.propertyName
      );
      let tenantCond = tenantId
        ? `"tenantId" = '${tenantId}'`
        : `"tenantId" IS NULL`;
      let whereClause = tenantCond;
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (fieldKeys.includes(key)) {
            if (
              key === "context" &&
              (value === "USERS" || value === "COHORT")
            ) {
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

      const fieldData = await this.getFieldData(whereClause);
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
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async searchFieldData(offset: number, limit: string, searchData: any) {
    const queryOptions: any = {
      where: searchData,
    };

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (limit !== undefined) {
      queryOptions.take = parseInt(limit);
    }

    const [results, totalCount] = await this.fieldsRepository.findAndCount(
      queryOptions
    );

    const mappedResponse = await this.mappedResponseField(results);
    return { mappedResponse, totalCount };
  }

  async createFieldValues(
    request: any,
    fieldValuesDto: FieldValuesDto,
    res: Response
  ) {
    const apiId = APIID.FIELDVALUES_CREATE;

    try {
      const result = await this.findAndSaveFieldValues(fieldValuesDto);
      if (!result) {
        APIResponse.error(
          res,
          apiId,
          `Fields not found or already exist`,
          `Fields not found or already exist`,
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.CREATED,
        "Field Values created successfully"
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async searchFieldValues(
    request: any,
    fieldValuesSearchDto: FieldValuesSearchDto,
    response: Response
  ) {
    const apiId = APIID.FIELDVALUES_SEARCH;
    try {
      const getConditionalData = await this.search(fieldValuesSearchDto);
      const offset = getConditionalData.offset;
      const limit = getConditionalData.limit;
      const whereClause = getConditionalData.whereClause;

      const getFieldValue = await this.getSearchFieldValueData(
        offset,
        limit,
        whereClause
      );

      const result = {
        totalCount: getFieldValue.totalCount,
        fields: getFieldValue.mappedResponse,
      };

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Field Values fetched successfully."
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getSearchFieldValueData(
    offset: number,
    limit: string,
    searchData: any
  ) {

    // Assign user in multiple block
    // const results = await this.fieldsValuesRepository
    // .createQueryBuilder("fieldValues")
    // .where("fieldValues.fieldId = :fieldId", { fieldId: searchData.fieldId })
    // .andWhere("fieldValues.value && :values", { values: searchData.value })
    // .getMany();

    const queryOptions: any = {
      where: searchData,
    };

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (limit !== undefined) {
      queryOptions.take = parseInt(limit);
    }
    try {
      const [results, totalCount] =
        await this.fieldsValuesRepository.findAndCount(queryOptions);
      const mappedResponse = await this.mappedResponse(results);

      return { mappedResponse, totalCount };
    } catch (error) {
      return error;
    }
  }
  //In operator
  async getSearchFieldValueDataByIds(
    offset: number,
    limit: string,
    searchData: any
  ) {
    const queryOptions: any = {
      where: {
        itemId: In(searchData),
      },
    };

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (limit !== undefined) {
      queryOptions.take = parseInt(limit);
    }
    try {
      const [results, totalCount] =
        await this.fieldsValuesRepository.findAndCount(queryOptions);
      const mappedResponse = await this.mappedResponse(results);

      return { mappedResponse, totalCount };
    } catch (error) {
      return error;
    }
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

  async updateFieldValues(
    id: string,
    fieldValuesUpdateDto: FieldValuesUpdateDto
  ) {
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
      const response = await this.fieldsValuesRepository.update(
        id,
        fieldValuesUpdateDto
      );

      return response;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  public async getFieldsAndFieldsValues(itemId: string) {
    const query = `SELECT FV."value" AS "selectedValues",FV."itemId", FV."fieldId", F."name" AS fieldname, F."label", F."context",F."type", F."state", F."contextType", F."fieldParams" FROM public."FieldValues" FV 
        LEFT JOIN public."Fields" F
        ON FV."fieldId" = F."fieldId" where FV."itemId" =$1`;
    const results = await this.fieldsValuesRepository.query(query, [itemId]);
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
        onlyUseInSubform: item?.onlyUseInSubform
          ? `${item.onlyUseInSubform}`
          : "",
        tenantId: item?.tenantId ? `${item.tenantId}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
        contextId: item?.contextId ? `${item.contextId}` : "",
        render: item?.render ? `${item.render}` : "",
        contextType: item?.contextType ? `${item.contextType}` : "",
        fieldParams: item?.fieldParams ? JSON.stringify(item.fieldParams) : "",
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
    let { limit } = dtoFileName;
    const { page, filters } = dtoFileName;

    let offset = 0;
    if (page > 1) {
      offset = parseInt(limit) * (page - 1);
    }

    if (limit.trim() === "") {
      limit = "0";
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
  public async getFieldOptions(
    fieldsOptionsSearchDto: FieldsOptionsSearchDto,
    response: Response
  ) {
    const apiId = APIID.FIELDVALUES_SEARCH;
    try {
      let dynamicOptions;
      let { limit, offset } = fieldsOptionsSearchDto;
      const {
        fieldName,
        controllingfieldfk,
        context,
        contextType,
        sort,
        optionName,
      } = fieldsOptionsSearchDto;

      offset = offset || 0;
      limit = limit || 1000;

      const condition: any = {
        name: fieldName,
      };

      if (context) {
        condition.context = context;
      }

      if (contextType) {
        condition.contextType = contextType;
      }

      const fetchFieldParams = await this.fieldsRepository.findOne({
        where: condition,
      });
      let order;
      if (sort?.length) {
        const orderKey = sort[1].toUpperCase();
        order = `ORDER BY "${sort[0]}" ${orderKey}`;
      } else {
        order = `ORDER BY ${fieldName}_name ASC`;
      }
      if (fetchFieldParams?.sourceDetails?.source === "table") {
        let whereClause;
        if (controllingfieldfk) {
          if (!fetchFieldParams.dependsOn) {
            return await APIResponse.error(
              response,
              apiId,
              `No ControllingFields Found for this Field`,
              `NOT_FOUND`,
              HttpStatus.NOT_FOUND
            );
          }
          let foreignKeys = controllingfieldfk.toString();
          whereClause = `"${fetchFieldParams?.dependsOn}_id" IN(${foreignKeys})`;
        }
        
        dynamicOptions = await this.findDynamicOptions(
          fieldName,
          whereClause,
          offset,
          limit,
          order,
          optionName
        );
      } else if (fetchFieldParams?.sourceDetails?.source === "jsonFile") {
        const filePath = path.join(
          process.cwd(),
          `${fetchFieldParams.sourceDetails.filePath}`
        );
        const getFieldValuesFromJson = JSON.parse(
          readFileSync(filePath, "utf-8")
        );

        if (controllingfieldfk) {
          dynamicOptions = getFieldValuesFromJson.options.filter(
            (option) => option?.controllingfieldfk === controllingfieldfk
          );
        } else {
          dynamicOptions = getFieldValuesFromJson;
        }
      } else {
        if (fetchFieldParams.fieldParams["options"] && controllingfieldfk) {
          dynamicOptions = fetchFieldParams?.fieldParams["options"].filter(
            (option: any) => option?.controllingfieldfk === controllingfieldfk
          );
        } else {
          dynamicOptions = fetchFieldParams?.fieldParams["options"];
        }
      }

      if (dynamicOptions.length === 0) {
        return await APIResponse.error(
          response,
          apiId,
          `No data found in ${fieldName} table`,
          `NOT_FOUND`,
          HttpStatus.NOT_FOUND
        );
      }

      // const queryData = dynamicOptions.map((result) => ({
      //   value: result?.value,
      //   label: result?.name,
      //   createdAt: result?.createdAt,
      //   updatedAt: result?.updatedAt,
      //   createdBy: result?.createdBy,
      //   updatedBy: result?.updatedBy,
      // }));

      /* Structing Into new Format */

      const queryData = dynamicOptions.map((item) => {
        const keys = Object.keys(item);
        const valueField = keys.find((key) => key.endsWith("_id")) || keys[0];
        const labelField = keys.find((key) => key.endsWith("_name")) || keys[1];

        return {
          value: item[valueField],
          label: item[labelField],
          ...Object.fromEntries(
            Object.entries(item).filter(
              ([key]) => !["value", "label"].includes(key)
            )
          ),
        };
      });

      const result = {
        totalCount: parseInt(dynamicOptions[0]?.total_count, 10),
        fieldId: fetchFieldParams?.fieldId,
        values: queryData,
      };

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Field options fetched successfully."
      );
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async deleteFieldOptions(requiredData, response) {
    const apiId = APIID.FIELD_OPTIONS_DELETE;
    try {
      let result: any = {};
      const condition: any = {
        name: requiredData.fieldName,
      };

      // If `context` and `contextType` are not provided, in that case check those fields where both `context` and `contextType` are null.
      const removeOption =
        requiredData.option !== null ? requiredData.option : null;

      if (requiredData.context !== null) {
        condition.context = requiredData.context;
      }
      if (requiredData.contextType) {
        condition.contextType = requiredData.contextType;
      }
      condition.name = requiredData.fieldName;

      // Fetch the total number of matching rows
      const totalCount = await this.fieldsRepository.count({
        where: condition,
      });
      if (totalCount > 1) {
        return await APIResponse.error(
          response,
          apiId,
          `Please select additional filters. The deletion cannot proceed because multiple fields have the same name.`,
          `BAD_REQUEST`,
          HttpStatus.BAD_REQUEST
        );
      }

      const getField = await this.fieldsRepository.findOne({
        where: condition,
      });

      if (!getField) {
        return await APIResponse.error(
          response,
          apiId,
          `Field not found.`,
          `NOT_FOUND`,
          HttpStatus.NOT_FOUND
        );
      }

      //Delete data from source table
      if (getField?.sourceDetails?.source == "table") {
        const whereCond = requiredData.option
          ? `WHERE "value"='${requiredData.option}'`
          : "";
        const query = `DELETE FROM public.${getField?.sourceDetails?.table} ${whereCond}`;
        const [_, affectedRow] = await this.fieldsRepository.query(query);

        if (affectedRow === 0) {
          return await APIResponse.error(
            response,
            apiId,
            `Fields option not found`,
            `NOT_FOUND`,
            HttpStatus.NOT_FOUND
          );
        }
        result = { affected: affectedRow };
      }
      //Delete data from fieldParams column
      if (getField?.sourceDetails?.source == "fieldparams") {
        // check options exits in fieldParams column or not
        const query = `SELECT * FROM public."Fields" WHERE "fieldId"='${getField.fieldId}' AND "fieldParams" -> 'options' @> '[{"value": "${removeOption}"}]' `;
        const checkSourceData = await this.fieldsRepository.query(query);

        if (checkSourceData.length > 0) {
          let fieldParamsOptions = checkSourceData[0].fieldParams.options;

          let fieldParamsData: any = {};
          if (fieldParamsOptions) {
            fieldParamsOptions = fieldParamsOptions.filter(
              (option) => option.name !== removeOption
            );
          }
          fieldParamsData =
            fieldParamsOptions.length > 0
              ? { options: fieldParamsOptions }
              : null;

          result = await this.fieldsRepository.update(
            { fieldId: getField.fieldId },
            { fieldParams: fieldParamsData }
          );
        } else {
          return await APIResponse.error(
            response,
            apiId,
            `Fields option not found`,
            `NOT_FOUND`,
            HttpStatus.NOT_FOUND
          );
        }
      }
      if (result.affected > 0) {
        return await APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.OK,
          "Field Options deleted successfully."
        );
      }
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findDynamicOptions(
    tableName,
    whereClause?: any,
    offset?: any,
    limit?: any,
    order?: any,
    optionSelected?: any
  ) {
    try {
      const orderCond = order || "";
      const offsetCond = offset ? `offset ${offset}` : "";
      const limitCond = limit ? `limit ${limit}` : "";
      const conditions = [];

      if (whereClause) {
        conditions.push(`${whereClause}`);
      }

      // Apply default filter to fetch only active records
      conditions.push(`is_active=1`);

      if (optionSelected) {
        conditions.push(`"${tableName}_name" ILike '%${optionSelected}%'`);
      }

      const whereCond = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const query = `SELECT *,COUNT(*) OVER() AS total_count FROM public."${tableName}" ${whereCond} ${orderCond} ${offsetCond} ${limitCond}`;

      const result = await this.fieldsRepository.query(query);
      if (!result) {
        return null;
      }

      return result;
    } catch (error) {
      return null;
    }
  }
  async findCustomFields(
    context: string,
    contextType?: string[],
    getFields?: string[]
  ) {
    const condition: any = {
      context,
      ...(contextType?.length
        ? { contextType: In(contextType.filter(Boolean)) }
        : {}),
      ...(getFields?.includes("All")
        ? {}
        : getFields?.length
          ? { name: In(getFields.filter(Boolean)) }
          : {}),
    };

    const validContextTypes = contextType?.filter(Boolean);
    if (validContextTypes?.length) {
      condition.contextType = In(validContextTypes);
    } else {
      condition.contextType = IsNull();
    }

    const customFields = await this.fieldsRepository.find({ where: [condition, {context: IsNull(), contextType: IsNull()}] });
    
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

    const result = await this.fieldsRepository.query(query, [contextId]);
    return result;
  }

  // OPTIMIZED VERSION - Much faster alternative to avoid JSON aggregation
  async filterUserUsingCustomFieldsOptimized(context: string, stateDistBlockData: any) {
    let joinCond = "";
    let targetTable = "";
    
    if (context === "COHORT") {
      joinCond = `JOIN "Cohort" u ON fv."itemId" = u."cohortId"`;
      targetTable = "Cohort";
    } else if (context === "USERS") {
      joinCond = `JOIN "Users" u ON fv."itemId" = u."userId"`;
      targetTable = "Users";
    } else {
      // Generic case - no specific table join
      targetTable = "FieldValues";
    }

    // Build EXISTS conditions for each field filter
    const conditions = [];
    let paramIndex = 1;
    const queryParams = [];

    for (const [fieldName, fieldValues] of Object.entries(stateDistBlockData)) {
      const values = Array.isArray(fieldValues) ? fieldValues : [fieldValues];
      
      // Create placeholders for parameterized query
      const valuePlaceholders = values.map(() => `$${paramIndex++}`);
      queryParams.push(...values);
      
      const condition = `
        EXISTS (
          SELECT 1 
          FROM "FieldValues" fv_inner
          JOIN "Fields" f_inner ON fv_inner."fieldId" = f_inner."fieldId"
          WHERE fv_inner."itemId" = ${context === 'COHORT' ? 'c."cohortId"' : 'u."userId"'}
            AND f_inner."name" = $${paramIndex}
            AND (f_inner.context IN($${paramIndex + 1}, 'NULL', 'null', '') OR f_inner.context IS NULL)
            AND fv_inner."value" && ARRAY[${valuePlaceholders.join(',')}]
        )`;
      
      queryParams.push(fieldName, context);
      paramIndex += 2;
      conditions.push(condition);
    }

    let query;
    if (context === "COHORT") {
      query = `
        SELECT DISTINCT c."cohortId" as "itemId"
        FROM "Cohort" c
        WHERE ${conditions.join(' AND ')}`;
    } else if (context === "USERS") {
      query = `
        SELECT DISTINCT u."userId" as "itemId"
        FROM "Users" u
        WHERE ${conditions.join(' AND ')}`;
    } else {
      // Fallback to original logic for unknown context
      return this.filterUserUsingCustomFields(context, stateDistBlockData);
    }

    const queryData = await this.fieldsValuesRepository.query(query, queryParams);
    const result = queryData.length > 0 ? queryData.map((item) => item.itemId) : null;
    return result;
  }

  async filterUserUsingCustomFields(context: string, stateDistBlockData: any) {
    const searchKey = [];
    let whereCondition = ` WHERE `;
    let index = 0;
    const tableName = "";
    let joinCond = "";

    if (context === "COHORT") {
      joinCond = `JOIN "Cohort" u ON fv."itemId" = u."cohortId"`;
    } else if (context === "USERS") {
      joinCond = `JOIN "Users" u ON fv."itemId" = u."userId"`;
    } else {
      joinCond = ``;
    }

    for (const [key, value] of Object.entries(stateDistBlockData)) {
      searchKey.push(`'${key}'`);
      if (index > 0) {
        whereCondition += ` AND `;
      }

      // using the ?| array[] operator to search for both single and multiple values in a JSONB column.
      whereCondition += `fields->'${key}' ?| array[${(Array.isArray(value)
        ? value
        : [value]
      )
        .map((v) => `'${v}'`)
        .join(",")}]`;
      index++;
    }

    const query = `WITH user_fields AS (
        SELECT
            fv."itemId",
            jsonb_object_agg(f."name", fv."value") AS fields
        FROM "FieldValues" fv
        JOIN "Fields" f ON fv."fieldId" = f."fieldId"
        ${joinCond}
        WHERE f."name" IN (${searchKey}) AND (f.context IN('${context}', 'NULL', 'null', '') OR f.context IS NULL)
        GROUP BY fv."itemId"
        )
        SELECT "itemId"
        FROM user_fields ${whereCondition}`;

    const queryData = await this.fieldsValuesRepository.query(query);
    const result =
      queryData.length > 0 ? queryData.map((item) => item.itemId) : null;
    return result;
  }

  async getFieldValuesData(
    id: string,
    context: string,
    contextType?: string,
    getFields?: string[],
    requiredFieldOptions?: boolean
  ) {
    let customField;
    const fieldsArr = [];
    const [filledValues, customFields] = await Promise.all([
      this.findFieldValues(id, context),
      this.findCustomFields(context, [contextType], getFields),
    ]);
    const filledValuesMap = new Map(
      filledValues.map((item) => [item.fieldId, item.value])
    );
    if (customFields) {
      for (const data of customFields) {
        const fieldValue = filledValuesMap.get(data?.fieldId);
        customField = {
          fieldId: data?.fieldId,
          name: data?.name,
          label: data?.label,
          order: data?.ordering,
          isRequired: data?.fieldAttributes?.isRequired,
          isEditable: data?.fieldAttributes?.isEditable,
          isHidden: data?.fieldAttributes?.isHidden,
          isMultiSelect: data.fieldAttributes
            ? data.fieldAttributes["isMultiSelect"]
            : "",
          maxSelections: data.fieldAttributes
            ? data.fieldAttributes["maxSelections"]
            : "",
          type: data?.type || "",
          value: fieldValue || "",
        };

        if (
          requiredFieldOptions == true &&
          (data?.dependsOn == "" || data?.dependsOn == undefined)
        ) {
          if (data?.sourceDetails?.source === "table") {
            const dynamicOptions = await this.findDynamicOptions(
              data?.sourceDetails?.table
            );
            customField.options = dynamicOptions;
          } else if (data?.sourceDetails?.source === "jsonFile") {
            const filePath = path.join(
              process.cwd(),
              `${data?.sourceDetails?.filePath}`
            );
            customField = JSON.parse(readFileSync(filePath, "utf-8"));
          } else {
            customField.options = data?.fieldParams?.["options"] || null;
          }
        } else {
          customField.options = null;
        }
        fieldsArr.push(customField);
      }
    }

    return fieldsArr;
  }

  async getEditableFieldsAttributes(tenantId: string) {
    let tenantData = tenantId ? tenantId : 'default'
    const getFieldsAttributesQuery = `
          SELECT * 
          FROM "public"."Fields" 
          WHERE "fieldAttributes"->>'isEditable' = $1; 
        `;        
    const getFieldsAttributesParams = ["true"];
    return await this.fieldsRepository.query(
      getFieldsAttributesQuery,
      getFieldsAttributesParams
    );
  }

  async updateCustomFields(itemId, data, fieldAttributesAndParams, additionalData?: { tenantId?: string, contextType?: string, createdBy?: string, updatedBy?: string }) {
    // Ensure value is stored as an array
    if (!Array.isArray(data.value)) {
      data.value = [data.value]; // Convert single value to array
    }

    const result: any = await this.fieldsValuesRepository.update(
      { itemId, fieldId: data.fieldId },
      { value: data.value }
    );

    let newResult;
    if (result.affected === 0) {
      newResult = await this.fieldsValuesRepository.save({
        itemId,
        fieldId: data.fieldId,
        value: data.value,
        tenantId: additionalData.tenantId,
        contextType: additionalData.contextType,
        createdBy: additionalData.createdBy,
        updatedBy: additionalData.updatedBy,
      });
    }

    Object.assign(result, newResult);
    result["correctValue"] = true;
    return result;
  }

  async updateUserCustomFields(itemId, data, fieldAttributesAndParams, additionalData?: { tenantId?: string, contextType?: string, createdBy?: string, updatedBy?: string }) {
    // Ensure value is stored as an array
    if (!Array.isArray(data.value)) {
      data.value = [data.value];
    }
  
    const result = await this.fieldsValuesRepository.insert({
      itemId,
      fieldId: data.fieldId,
      value: data.value,
      tenantId: additionalData.tenantId,
      contextType: additionalData.contextType,
      createdBy: additionalData.createdBy,
      updatedBy: additionalData.updatedBy,
    });
  
    return {
      ...result,
      correctValue: true,
    };
  }

  async getFieldIdByLabel(label: string, tenantId?: string) {
    const whereCondition: any = { label: label };
    if (tenantId) {
      whereCondition.tenantId = tenantId;
    }
    
    const response = await this.fieldsRepository.findOne({
      where: whereCondition,
      select: ['fieldId']
    });
    return response?.fieldId || null;
  }
  
  validateFieldValue(field: any, value: any) {
    try {
      const fieldInstance = FieldFactory.createField(
        field.type,
        field.fieldAttributes,
        field.fieldParams
      );
      const isValid = fieldInstance.validate(value);
      return isValid;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      return { error: e };
    }
  }

  getFieldValueForMultiselect(isMultiSelect: boolean, fieldValue: any) {
    if (isMultiSelect) {
      return fieldValue.split(",");
    }
    return fieldValue;
  }

  mappedFields(fieldDataList, tenantId) {
    const mappedFields: SchemaField[] = fieldDataList.map((field) => {
      const options =
        field.fieldParams?.options?.map((opt) => ({
          label: opt.label,
          value: opt.value,
        })) || [];

      // let fieldValidation = field.fieldAttributes[tenantId] || field.fieldAttributes["default"];
      let fieldValidation = field.fieldAttributes;

      return {
        label: field.label,
        name: field.name,
        type: field.type,
        coreField: 0,
        isRequired: field?.fieldAttributes?.isRequired || false,
        isEditable: field.fieldAttributes?.isEditable ?? null,
        isHidden: field.fieldAttributes?.isHidden ?? null,
        isPIIField: field.fieldAttributes?.isPIIField ?? null,
        placeholder: field.fieldAttributes?.placeholder ?? "",
        validation: fieldValidation || [],
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
        ordering: field.ordering ?? null,
        default: field?.fieldAttributes?.default ?? null,
      };
    });
    return mappedFields;
  }

  /* This function Fetches the Custom Field Enteres By User. Here
       Here It convert the Value into Real Option.
       Used in getUserDetails API as of Now.
    */
  public async getCustomFieldDetails(
    itemId: string,
    tableName: string,
    fieldOption?: boolean
  ) {
    let joinCond;
    if (tableName === "Users") {
      joinCond = `fv."itemId" = u."userId"`;
    } else if (tableName === "Cohort") {
      joinCond = `fv."itemId" = u."cohortId"`;
    }
    try {
      const query = `
      SELECT DISTINCT 
        f."fieldId",
        f."label", 
        fv."value", 
        f."type", 
        f."fieldParams",
        f."sourceDetails"
      FROM public."${tableName}" u
      LEFT JOIN (
        SELECT DISTINCT ON (fv."fieldId", fv."itemId") fv.*
        FROM public."FieldValues" fv
      ) fv ON ${joinCond}
      INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
      WHERE fv."itemId" = $1;
    `;

      let result = await this.fieldsRepository.query(query, [itemId]);
      result = result.map(async (data) => {
        const allIds = data.value;
        let optionValues;

        // let processedValue = data.value;
        let selectedValues = data.value;
        const allFieldsOptions = data?.fieldParams?.options
          ? data.fieldParams.options
          : null;
        let processedValue = [];
        let allSelectedValues;

        if (data.sourceDetails) {
          if (data.sourceDetails.source === "fieldparams") {
            allFieldsOptions.forEach((option) => {
              const selectedOptionKey = option.value;

              if (data.type === "checkbox" || data.type === "drop_down") {
                if (selectedValues.includes(selectedOptionKey)) {
                  allSelectedValues = {
                    id: option?.value,
                    value: option?.value,
                    label: option?.label,
                  };
                  processedValue.push(allSelectedValues);
                }
              } else {
                if (selectedValues.includes(selectedOptionKey)) {
                  allSelectedValues = {
                    id: option?.name,
                    value: option?.value,
                    label: option?.label,
                    order: option?.order,
                  };
                  processedValue.push(allSelectedValues);
                }
              }
            });
          } else if (data.sourceDetails.source === "table") {
            const whereCond = `"${data.sourceDetails.table}_id" IN (${allIds})`;
            const labels = await this.findDynamicOptions(
              data.sourceDetails.table,
              whereCond
            );
            const tableName = data.sourceDetails.table;

            // Dynamically construct field names
            const idField = `${tableName}_id`;
            const nameField = `${tableName}_name`;

            processedValue = labels.map((data) => ({
              id: data[idField],
              value: data[nameField],
            }));
          } else if (data.sourceDetails?.externalsource) {
              processedValue = data?.value
          }
        } else {
          processedValue = selectedValues;
        }
        delete data.fieldParams;
        delete data.sourceDetails;
        delete data.value;

        return {
          ...data,
          selectedValues: processedValue,
        };
      });
      result = await Promise.all(result);
      return result;
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Batch fetch custom fields for multiple items (optimized for N+1 query problem)
   * @param itemIds - Array of item IDs (userIds or cohortIds)
   * @param tableName - Table name ('Users' or 'Cohort')
   * @returns Object mapping itemId to their custom fields array
   */
  public async getBulkCustomFieldDetails(
    itemIds: string[],
    tableName: string
  ): Promise<Record<string, any[]>> {
    if (!itemIds || itemIds.length === 0) {
      return {};
    }

    let joinCond: string;
    if (tableName === "Users") {
      joinCond = `fv."itemId" = u."userId"`;
    } else if (tableName === "Cohort") {
      joinCond = `fv."itemId" = u."cohortId"`;
    }

    try {
      // Single query to fetch all custom fields for all items
      const query = `
      SELECT DISTINCT 
        fv."itemId",
        f."fieldId",
        f."label", 
        fv."value", 
        f."type", 
        f."fieldParams",
        f."sourceDetails"
      FROM public."${tableName}" u
      LEFT JOIN (
        SELECT DISTINCT ON (fv."fieldId", fv."itemId") fv.*
        FROM public."FieldValues" fv
        WHERE fv."itemId" = ANY($1)
      ) fv ON ${joinCond}
      INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
      WHERE fv."itemId" = ANY($1)
      ORDER BY fv."itemId", f."fieldId";
    `;

      let results = await this.fieldsRepository.query(query, [itemIds]);

      // Process all results
      const processedResults = await Promise.all(
        results.map(async (data) => {
          const allIds = data.value;
          let processedValue = [];
          let allSelectedValues;
          const selectedValues = data.value;
          const allFieldsOptions = data?.fieldParams?.options
            ? data.fieldParams.options
            : null;

          if (data.sourceDetails) {
            if (data.sourceDetails.source === "fieldparams") {
              allFieldsOptions.forEach((option) => {
                const selectedOptionKey = option.value;

                if (data.type === "checkbox" || data.type === "drop_down") {
                  if (selectedValues.includes(selectedOptionKey)) {
                    allSelectedValues = {
                      id: option?.value,
                      value: option?.value,
                      label: option?.label,
                    };
                    processedValue.push(allSelectedValues);
                  }
                } else {
                  if (selectedValues.includes(selectedOptionKey)) {
                    allSelectedValues = {
                      id: option?.name,
                      value: option?.value,
                      label: option?.label,
                      order: option?.order,
                    };
                    processedValue.push(allSelectedValues);
                  }
                }
              });
            } else if (data.sourceDetails.source === "table") {
              const whereCond = `"${data.sourceDetails.table}_id" IN (${allIds})`;
              const labels = await this.findDynamicOptions(
                data.sourceDetails.table,
                whereCond
              );
              const tableName = data.sourceDetails.table;

              const idField = `${tableName}_id`;
              const nameField = `${tableName}_name`;

              processedValue = labels.map((data) => ({
                id: data[idField],
                value: data[nameField],
              }));
            } else if (data.sourceDetails?.externalsource) {
              processedValue = data?.value;
            }
          } else {
            processedValue = selectedValues;
          }

          return {
            itemId: data.itemId,
            fieldId: data.fieldId,
            label: data.label,
            type: data.type,
            selectedValues: processedValue,
          };
        })
      );

      // Group by itemId
      const groupedByItemId: Record<string, any[]> = {};
      
      // Initialize all itemIds with empty arrays
      itemIds.forEach(itemId => {
        groupedByItemId[itemId] = [];
      });

      // Group results by itemId
      processedResults.forEach((field) => {
        if (!groupedByItemId[field.itemId]) {
          groupedByItemId[field.itemId] = [];
        }
        groupedByItemId[field.itemId].push({
          fieldId: field.fieldId,
          label: field.label,
          selectedValues: field.selectedValues,
          type: field.type,
        });
      });

      return groupedByItemId;
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error in getBulkCustomFieldDetails: ${error.message}`
      );
      // Return empty object for all items on error
      const emptyResult: Record<string, any[]> = {};
      itemIds.forEach(itemId => {
        emptyResult[itemId] = [];
      });
      return emptyResult;
    }
  }

  public async getFieldsByIds(fieldIds: string[]) {
    return this.fieldsRepository.find({
      where: {
        fieldId: In(fieldIds),
      },
    });
  }
  async deleteFieldValues(
    fieldValuesDeleteDto: FieldValuesDeleteDto,
    response: Response
  ) {
    const apiId = APIID.FIELDVALUES_DELETE;
    try {
      const fieldValues = fieldValuesDeleteDto.fieldValues;

      // Create the list of conditions from fieldValues
      const conditions = fieldValues.map((value) => ({
        fieldId: value.fieldId,
        itemId: value.itemId,
      }));

      // Use QueryBuilder to delete matching records
      const result = await this.fieldsValuesRepository
        .createQueryBuilder()
        .delete()
        .from("FieldValues")
        .where(
          conditions
            .map(
              (condition, index) =>
                `(fieldId = :fieldId${index} AND itemId = :itemId${index})`
            )
            .join(" OR "),
          conditions.reduce((acc, condition, index) => {
            acc[`fieldId${index}`] = condition.fieldId;
            acc[`itemId${index}`] = condition.itemId;
            return acc;
          }, {})
        )
        .execute();

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Field Values deleted successfully."
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      const errorMessage = e?.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
