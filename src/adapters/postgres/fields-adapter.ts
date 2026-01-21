import { ConsoleLogger, HttpStatus, Injectable } from '@nestjs/common';
import { FieldsDto } from 'src/fields/dto/fields.dto';
import {
  FieldsOptionsSearchDto,
  FieldsSearchDto,
} from 'src/fields/dto/fields-search.dto';
import { FieldValuesDto } from 'src/fields/dto/field-values.dto';
import { FieldValuesUpdateDto } from 'src/fields/dto/field-values-update.dto';
import { FieldValuesSearchDto } from 'src/fields/dto/field-values-search.dto';
import { ErrorResponse } from 'src/error-response';
import { Fields } from '../../fields/entities/fields.entity';
import { FieldValues } from '../../fields/entities/fields-values.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import APIResponse from 'src/common/responses/response';
import { APIID } from 'src/common/utils/api-id.config';
import { IServicelocatorfields } from '../fieldsservicelocator';
import { Response } from 'express';
import { readFileSync } from 'fs';
import path, { join } from 'path';
import { FieldFactory } from 'src/fields/fieldValidators/fieldFactory';
import { FieldsUpdateDto } from 'src/fields/dto/fields-update.dto';
import { SchemaField, Option } from 'src/fields/fieldValidators/fieldClass';
import jwt_decode from 'jwt-decode';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { API_RESPONSES } from '@utils/response.messages';
import { v4 as uuidv4 } from 'uuid';
import { FieldValueConverter } from 'src/utils/field-value-converter';
import { FieldStatus } from 'src/fields/dto/field-values-create.dto';
import { COUNTRY_SET } from '../../common/country-registry';
@Injectable()
export class PostgresFieldsService implements IServicelocatorfields {
  constructor(
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldsValuesRepository: Repository<FieldValues>
  ) {}

  async getFormCustomField(requiredData, response) {
    const apiId = 'FormData';
    try {
      let whereClause = '(context IS NULL AND "contextType" IS NULL)';
      const fileread = readFileSync(
        join(process.cwd(), 'src/utils/corefield.json'),
        'utf8'
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
            'NOT_FOUND',
            `Fields not found for the search term`,
            HttpStatus.NOT_FOUND
          );
        }
        return APIResponse.success(
          response,
          apiId,
          data,
          HttpStatus.OK,
          'Fields fetched successfully.'
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
          'NOT_FOUND',
          `Fields not found for the search term`,
          HttpStatus.NOT_FOUND
        );
      }
      if (
        requiredData.context === 'USERS' ||
        requiredData.context === 'COHORT'
      ) {
        const coreFields = corefield[requiredData.context.toLowerCase()];
        data.push(...coreFields);
      }
      return APIResponse.success(
        response,
        apiId,
        data,
        HttpStatus.OK,
        'Fields fetched successfully.'
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
    const fieldValues = cohortCreateDto ? cohortCreateDto.customFields : [];
    const encounteredKeys = [];
    const invalidateFields = [];
    const duplicateFieldKeys = [];
    const error = '';

    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData['fieldId'];
      const getFieldDetails: any = await this.getFieldByIdes(fieldId);

      if (getFieldDetails == null) {
        return {
          isValid: false,
          error: `Field not found`,
        };
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails['name']}`);
      } else {
        encounteredKeys.push(fieldId);
      }

      if (
        (getFieldDetails.type == 'checkbox' ||
          getFieldDetails.type == 'drop_down' ||
          getFieldDetails.type == 'textarea' ||
          getFieldDetails.type == 'calendar' ||
          getFieldDetails.type == 'radio') &&
        getFieldDetails.sourceDetails.source == 'table'
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
        getFieldDetails['fieldParams'] = transformedFieldParams;
      } else {
        getFieldDetails['fieldParams'] = getFieldDetails?.fieldParams ?? {};
      }

      const checkValidation = this.validateFieldValue(
        getFieldDetails,
        fieldsData['value']
      );

      if (typeof checkValidation === 'object' && 'error' in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails['name']} - ${checkValidation?.error?.message}`
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
    const context = 'COHORT';

    const getFieldIds = await this.getFieldIds(context, contextType);

    const validFieldIds = new Set(getFieldIds.map((field) => field.fieldId));

    const invalidFieldIds = cohortCreateDto.customFields
      .filter((fieldValue) => !validFieldIds.has(fieldValue.fieldId))
      .map((fieldValue) => fieldValue.fieldId);

    if (invalidFieldIds.length > 0) {
      return {
        isValid: false,
        error: `The following fields are not valid for this user: ${invalidFieldIds.join(
          ', '
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
    const error = '';

    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData['fieldId'];
      const getFieldDetails: any = await this.getFieldByIdes(fieldId);

      if (getFieldDetails == null) {
        return {
          isValid: false,
          error: `Field not found`,
        };
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails['name']}`);
      } else {
        encounteredKeys.push(fieldId);
      }

      if (
        (getFieldDetails.type == 'checkbox' ||
          getFieldDetails.type == 'drop_down' ||
          getFieldDetails.type == 'textarea' ||
          getFieldDetails.type == 'calendar' ||
          getFieldDetails.type == 'radio') &&
        getFieldDetails.sourceDetails.source == 'table'
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
        getFieldDetails['fieldParams'] = transformedFieldParams;
      } else {
        getFieldDetails['fieldParams'] = getFieldDetails?.fieldParams ?? {};
      }

      const checkValidation = this.validateFieldValue(
        getFieldDetails,
        fieldsData['value']
      );

      if (typeof checkValidation === 'object' && 'error' in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails['name']} - ${checkValidation?.error?.message}`
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
          ', '
        )}.`,
      };
    }
    return {
      isValid: true,
    };
  }

  async getFieldData(whereClause): Promise<any> {
    const query = `select * from public."Fields" where ${whereClause}`;

    const result = await this.fieldsRepository.query(query);
    if (!result) {
      return false;
    }
    for (const data of result) {
      if (
        ((data?.dependsOn == '' ||
          data?.dependsOn == undefined ||
          data?.dependsOn == null) &&
          data?.sourceDetails?.source === 'table') ||
        data?.sourceDetails?.source === 'jsonfile'
      ) {
        const options = await this.findDynamicOptions(data.sourceDetails.table);

        // data.fieldParams = data.fieldParams || {};
        // data.fieldParams.options = options;
        const formattedOptions = options.map((option: any) => ({
          label: option.name, // Setting label same as value
          value: option.value,
        }));
        data.fieldParams = data.fieldParams || {};
        data.fieldParams.options = formattedOptions;
      }
    }
    const schema = this.mappedFields(result);
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
        if (fieldsDto[e] && fieldsDto[e] !== '') {
          if (e === 'render') {
            fieldsData[e] = fieldsDto[e];
          } else if (Array.isArray(fieldsDto[e])) {
            fieldsData[e] = JSON.stringify(fieldsDto[e]);
          } else {
            fieldsData[e] = fieldsDto[e];
          }
        }
      });
      fieldsData['required'] = true;
      // Ensure default status is 'active'
      fieldsData['status'] = fieldsData['status'] || FieldStatus.ACTIVE;

      const checkFieldExist = await this.fieldsRepository.find({
        where: {
          context: fieldsData.context,
          contextType: fieldsData.contextType,
          name: fieldsData.name,
          type: fieldsData.type,
          contextId: fieldsData.contextId,
          status: FieldStatus.ACTIVE,
        },
      });
      if (checkFieldExist.length > 0) {
        return APIResponse.error(
          response,
          apiId,
          `CONFLICT`,
          `Fields already exist`,
          HttpStatus.CONFLICT
        );
      }

      const storeWithoutControllingField = [];
      let error = '';
      if (
        fieldsData.sourceDetails &&
        fieldsData.sourceDetails.source == 'table' &&
        fieldsData.fieldParams
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          if (
            fieldsData.dependsOn &&
            (!sourceFieldName['controllingfieldfk'] ||
              sourceFieldName['controllingfieldfk'] === '')
          ) {
            storeWithoutControllingField.push(sourceFieldName['name']);
          }

          const query = `SELECT "name", "value" 
          FROM public.${fieldsData.sourceDetails.table} 
          WHERE value = '${sourceFieldName['value']}' 
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
                'BAD_REQUEST',
                `Error: This code '${sourceFieldName['value']}' does not exist in the '${fieldsData.sourceDetails.table}' table.`,
                HttpStatus.BAD_REQUEST
              );
            }

            // If not exist and isCreate is true, create the record
            await this.createSourceDetailsTableFields(
              fieldsData.sourceDetails.table,
              sourceFieldName['name'],
              sourceFieldName['value'],
              createdBy,
              sourceFieldName['controllingfieldfk'],
              fieldsData.dependsOn
            );
          } else {
            //If code is exist in db and isCreate flag is true
            if (fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                'CONFLICT',
                `Error: This code '${sourceFieldName['value']}' already exists for '${checkSourceData[0].name}' in the '${fieldsData.sourceDetails.table}' table.`,
                HttpStatus.CONFLICT
              );
            }

            // If exist and isCreate is false, update the record
            await this.updateSourceDetailsTableFields(
              fieldsData.sourceDetails.table,
              sourceFieldName['name'],
              sourceFieldName['value'],
              updatedBy,
              sourceFieldName['controllingfieldfk']
            );
          }
        }
        delete fieldsData.fieldParams;
      }

      if (storeWithoutControllingField.length > 0) {
        const wrongControllingField = storeWithoutControllingField.join(',');
        error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`;
      }

      const result = await this.fieldsRepository.save(fieldsData);

      return await APIResponse.success(
        response,
        apiId,
        { result, error },
        HttpStatus.CREATED,
        'Fields created successfully.'
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
      let error = '';

      Object.keys(fieldsUpdateDto).forEach((e) => {
        if (fieldsUpdateDto[e] && fieldsUpdateDto[e] !== '') {
          if (e === 'render') {
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

      fieldsData['type'] = fieldsData.type || getSourceDetails.type;

      //Update field options
      //Update data in source table
      if (
        getSourceDetails.sourceDetails &&
        fieldsData.fieldParams &&
        fieldsData.fieldParams.options &&
        getSourceDetails.sourceDetails.source == 'table'
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          if (
            getSourceDetails.dependsOn &&
            (!sourceFieldName['controllingfieldfk'] ||
              sourceFieldName['controllingfieldfk'] === '')
          ) {
            storeWithoutControllingField.push(sourceFieldName['name']);
          }

          // Generate UUID instead of auto-incremented integer
          const nextValue = uuidv4();

          // check options exits in source table column or not
          const query = `SELECT "name", "value" 
          FROM public.${getSourceDetails.sourceDetails.table} 
          WHERE value = '${sourceFieldName['value']}' 
          GROUP BY  "name", "value"`;

          const checkSourceData = await this.fieldsValuesRepository.query(
            query
          );
          // **Check if `name` exists in the database**
          const queryNameCheck = `SELECT "name" FROM public.${getSourceDetails.sourceDetails.table} 
 WHERE name = '${sourceFieldName['name']}'`;

          const checkNameData = await this.fieldsValuesRepository.query(
            queryNameCheck
          );

          //If code is not exist in db
          if (checkSourceData.length === 0 && checkNameData.length === 0) {
            //If code is not exist in db and isCreate flag is false
            if (!fieldsData.fieldParams.isCreate) {
              return APIResponse.error(
                response,
                apiId,
                'BAD_REQUEST',
                `Error: This code '${sourceFieldName['value']}' does not exist in the '${getSourceDetails.sourceDetails.table}' table.`,
                HttpStatus.BAD_REQUEST
              );
            }

            // If not exist and isCreate is true, create the record
            await this.createSourceDetailsTableFields(
              getSourceDetails.sourceDetails.table,
              sourceFieldName['name'],
              nextValue, // Use UUID instead of integer
              createdBy,
              sourceFieldName['controllingfieldfk'],
              getSourceDetails.dependsOn
            );
          } else {
            //If code is exist in db and isCreate flag is true
            if (fieldsData.fieldParams.isCreate) {
              if (checkNameData.length > 0) {
                return APIResponse.error(
                  response,
                  apiId,
                  'CONFLICT',
                  `Error: The name '${sourceFieldName['name']}' already exists in the '${getSourceDetails.sourceDetails.table}' table.`,
                  HttpStatus.CONFLICT
                );
              }
              return APIResponse.error(
                response,
                apiId,
                'CONFLICT',
                `Error: This code '${sourceFieldName['value']}' already exists for '${checkSourceData[0].name}' in the '${getSourceDetails.sourceDetails.table}' table.`,
                HttpStatus.CONFLICT
              );
            }

            // If exist and isCreate is false, update the record
            await this.updateSourceDetailsTableFields(
              getSourceDetails.sourceDetails.table,
              sourceFieldName['name'],
              checkSourceData[0].value, // Keep the existing UUID
              updatedBy,
              sourceFieldName['controllingfieldfk']
            );
          }
        }
        delete fieldsData.fieldParams;
      }

      //Update data in field params
      if (
        getSourceDetails.sourceDetails &&
        getSourceDetails.sourceDetails.source == 'fieldparams'
      ) {
        for (const sourceFieldName of fieldsData.fieldParams.options) {
          //Store those fields is depends on another fields but did not provide controlling field foreign key
          if (
            fieldsData.dependsOn &&
            (!sourceFieldName['controllingfieldfk'] ||
              sourceFieldName['controllingfieldfk'] === '')
          ) {
            storeWithoutControllingField.push(sourceFieldName['name']);
          }

          // check options exits in fieldParams column or not
          const query = `SELECT COUNT(*) FROM public."Fields" WHERE "fieldId"='${fieldId}' AND "fieldParams" -> 'options' @> '[{"value": "${sourceFieldName['value']}"}]' `;
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
                'Internal Server Error',
                `Error : ${addFieldParamsValue}`,
                HttpStatus.INTERNAL_SERVER_ERROR
              );
            }
          }
        }
      }

      //If fields is depends on another fields but did not provide controlling field foreign key
      if (storeWithoutControllingField.length > 0) {
        const wrongControllingField = storeWithoutControllingField.join(',');
        error = `Wrong Data: ${wrongControllingField} This field is dependent on another field and cannot be created without specifying the controllingfieldfk.`;
      }

      const result = await this.fieldsRepository.update(fieldId, fieldsData);
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        'Fields updated successfully.'
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
          ? existingField.fieldParams['options']
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
    if (controllingfieldfk !== undefined && controllingfieldfk !== '') {
      createSourceFields += `, controllingfieldfk`;
    }

    createSourceFields += `) VALUES ('${name}', '${value}', '${createdBy}'`;

    // Add controllingfieldfk to the values if it is defined
    if (controllingfieldfk !== undefined && controllingfieldfk !== '') {
      createSourceFields += `, '${controllingfieldfk}'`;
    }

    createSourceFields += `);`;

    if (dependsOn && (!controllingfieldfk || controllingfieldfk === '')) {
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
      select: ['fieldId'],
    });

    return result;
  }

  async getFieldByIdes(fieldId: string) {
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

  /**
   * Creates a field directly in the database without HTTP responses
   * @param fieldsData The field data to create
   * @returns The created field entity
   */
  async createFieldDirectly(fieldsData: any): Promise<any> {
    try {
      // Check if field already exists
      const existingField = await this.fieldsRepository.find({
        where: {
          context: fieldsData.context,
          contextType: fieldsData.contextType,
          name: fieldsData.name,
          type: fieldsData.type,
          contextId: fieldsData.contextId,
          status: FieldStatus.ACTIVE,
        },
      });

      if (existingField.length > 0) {
        return existingField[0];
      }

      // Create the field
      const result = await this.fieldsRepository.save(fieldsData);

      return result;
    } catch (error) {
      LoggerUtil.error(`Error creating field directly: ${error.message}`);
      throw error;
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
              key === 'context' &&
              (value === 'USERS' || value === 'COHORT')
            ) {
              whereClause += ` AND "context" = '${value}'`;
            } else {
              whereClause += ` AND "${key}" = '${value}'`;
            }
          } else {
            return APIResponse.error(
              response,
              apiId,
              'BAD_REQUEST',
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
          'NOT_FOUND',
          `Fields not found for the search term`,
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        response,
        apiId,
        fieldData,
        HttpStatus.OK,
        'Fields fetched successfully.'
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
        'Field Values created successfully'
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
        'Field Values fetched successfully.'
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
      // Get existing field value and type
      const existingValue = await this.fieldsValuesRepository.findOne({
        where: { fieldValuesId: id },
      });

      if (!existingValue) {
        throw new Error('Field value not found');
      }

      const fieldDetails = await this.fieldsRepository.findOne({
        where: { fieldId: existingValue.fieldId },
      });

      if (!fieldDetails) {
        throw new Error('Field not found');
      }

      // Use FieldValueConverter to prepare data
      const fieldData = FieldValueConverter.prepareFieldData(
        existingValue.fieldId,
        fieldValuesUpdateDto.value,
        existingValue.itemId,
        fieldDetails.type
      );

      const response = await this.fieldsValuesRepository.update(id, fieldData);
      return response;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      return new ErrorResponse({
        errorCode: '400',
        errorMessage: e,
      });
    }
  }

  public async getFieldsAndFieldsValues(itemId: string) {
    const query = `
      SELECT 
        FV."fieldValuesId",
        FV."value",
        FV."textValue",
        FV."numberValue",
        FV."calendarValue",
        FV."dropdownValue",
        FV."radioValue",
        FV."checkboxValue",
        FV."textareaValue",
        FV."itemId", 
        FV."fieldId",
        F."name" AS fieldname,
        F."label",
        F."context",
        F."type",
        F."state",
        F."contextType",
        F."fieldParams"
      FROM public."FieldValues" FV 
      LEFT JOIN public."Fields" F ON FV."fieldId" = F."fieldId" 
      WHERE FV."itemId" = $1`;

    const results = await this.fieldsValuesRepository.query(query, [itemId]);

    // Transform results to use typed values with fallback to generic value
    return results.map((result) => {
      let typedValue;
      switch (result.type) {
        case 'text':
          typedValue = result.textValue || result.value;
          break;
        case 'numeric':
          typedValue = result.numberValue || result.value;
          break;
        case 'calendar':
          typedValue = result.calendarValue || result.value;
          break;
        case 'drop_down':
          typedValue = result.dropdownValue || result.value;
          break;
        case 'radio':
          typedValue = result.radioValue || result.value;
          break;
        case 'checkbox':
          typedValue = result.checkboxValue || result.value;
          break;
        case 'textarea':
          typedValue = result.textareaValue || result.value;
          break;
        default:
          typedValue = result.value;
      }

      return {
        fieldValuesId: result.fieldValuesId,
        fieldId: result.fieldId,
        fieldname: result.fieldname,
        label: result.label,
        type: result.type,
        value: typedValue,
        context: result.context,
        state: result.state,
        contextType: result.contextType,
        fieldParams: result.fieldParams,
      };
    });
  }

  public async mappedResponse(result: any) {
    const fieldValueResponse = result.map((item: any) => {
      const fieldValueMapping = {
        value: item?.value ? `${item.value}` : '',
        fieldValuesId: item?.fieldValuesId ? `${item.fieldValuesId}` : '',
        itemId: item?.itemId ? `${item.itemId}` : '',
        fieldId: item?.fieldId ? `${item.fieldId}` : '',
        createdAt: item?.createdAt ? `${item.createdAt}` : '',
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : '',
        createdBy: item?.createdBy ? `${item.createdBy}` : '',
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : '',
      };

      return new FieldValuesDto(fieldValueMapping);
    });

    return fieldValueResponse;
  }

  public async mappedResponseField(result: any) {
    const fieldResponse = result.map((item: any) => {
      const fieldMapping = {
        fieldId: item?.fieldId ? `${item.fieldId}` : '',
        assetId: item?.assetId ? `${item.assetId}` : '',
        context: item?.context ? `${item.context}` : '',
        groupId: item?.groupId ? `${item.groupId}` : '',
        name: item?.name ? `${item.name}` : '',
        label: item?.label ? `${item.label}` : '',
        defaultValue: item?.defaultValue ? `${item.defaultValue}` : '',
        type: item?.type ? `${item.type}` : '',
        note: item?.note ? `${item.note}` : '',
        description: item?.description ? `${item.description}` : '',
        state: item?.state ? `${item.state}` : '',
        required: item?.required ? `${item.required}` : '',
        ordering: item?.ordering ? `${item.ordering}` : '',
        metadata: item?.metadata ? `${item.metadata}` : '',
        access: item?.access ? `${item.access}` : '',
        onlyUseInSubform: item?.onlyUseInSubform
          ? `${item.onlyUseInSubform}`
          : '',
        tenantId: item?.tenantId ? `${item.tenantId}` : '',
        createdAt: item?.createdAt ? `${item.createdAt}` : '',
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : '',
        createdBy: item?.createdBy ? `${item.createdBy}` : '',
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : '',
        contextId: item?.contextId ? `${item.contextId}` : '',
        render: item?.render ? `${item.render}` : '',
        contextType: item?.contextType ? `${item.contextType}` : '',
        fieldParams: item?.fieldParams ? JSON.stringify(item.fieldParams) : '',
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
      // Get field type from Fields table
      const fieldDetails = await this.fieldsRepository.findOne({
        where: { fieldId: fieldValuesDto.fieldId },
      });

      if (!fieldDetails) {
        throw new Error('Field not found');
      }

      // Use the utility to prepare field data
      const fieldData = FieldValueConverter.prepareFieldData(
        fieldValuesDto.fieldId,
        fieldValuesDto.value,
        fieldValuesDto.itemId,
        fieldDetails.type
      );

      // Add createdBy and updatedBy if present
      if (fieldValuesDto.createdBy) {
        fieldData.createdBy = fieldValuesDto.createdBy;
      }
      if (fieldValuesDto.updatedBy) {
        fieldData.updatedBy = fieldValuesDto.updatedBy;
      }

      const result = await this.fieldsValuesRepository.save(fieldData);
      return result;
    }
    return false;
  }

  public async search(dtoFileName) {
    let { limit, page, filters } = dtoFileName;

    // Ensure limit and page are numbers with defaults
    limit = typeof limit === 'number' ? limit : Number(limit) || 10;
    page = typeof page === 'number' ? page : Number(page) || 1;

    // Calculate offset
    let offset = 0;
    if (page > 1) {
      offset = limit * (page - 1);
    }

    // Build where clause
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
      limit = limit || 200;

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
        order = `ORDER BY name ASC`;
      }

      if (fetchFieldParams?.sourceDetails?.source === 'table') {
        let whereClause;
        if (controllingfieldfk) {
          whereClause = `"controllingfieldfk" = '${controllingfieldfk}'`;
        }

        dynamicOptions = await this.findDynamicOptions(
          fieldName,
          whereClause,
          offset,
          limit,
          order,
          optionName
        );
      } else if (fetchFieldParams?.sourceDetails?.source === 'jsonFile') {
        const filePath = path.join(
          process.cwd(),
          `${fetchFieldParams.sourceDetails.filePath}`
        );
        const getFieldValuesFromJson = JSON.parse(
          readFileSync(filePath, 'utf-8')
        );

        if (controllingfieldfk) {
          dynamicOptions = getFieldValuesFromJson.options.filter(
            (option) => option?.controllingfieldfk === controllingfieldfk
          );
        } else {
          dynamicOptions = getFieldValuesFromJson;
        }
      } else {
        if (fetchFieldParams.fieldParams['options'] && controllingfieldfk) {
          dynamicOptions = fetchFieldParams?.fieldParams['options'].filter(
            (option: any) => option?.controllingfieldfk === controllingfieldfk
          );
        } else {
          dynamicOptions = fetchFieldParams?.fieldParams['options'];
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

      const queryData = dynamicOptions.map((result) => ({
        value: result?.value,
        label: result?.name,
        createdAt: result?.createdAt,
        updatedAt: result?.updatedAt,
        createdBy: result?.createdBy,
        updatedBy: result?.updatedBy,
      }));

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
        'Field options fetched successfully.'
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
      if (getField?.sourceDetails?.source == 'table') {
        const whereCond = requiredData.option
          ? `WHERE "value"='${requiredData.option}'`
          : '';
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
      if (getField?.sourceDetails?.source == 'fieldparams') {
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
          'Field Options deleted successfully.'
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

  public async deleteField(requiredData, response) {
    const apiId = APIID.FIELD_OPTIONS_DELETE;
    try {
      const { fieldId, fieldName, softDelete = true } = requiredData || {};

      if (!fieldId && !fieldName) {
        return await APIResponse.error(
          response,
          apiId,
          'Either fieldId or fieldName must be provided to delete a field.',
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }

      // Build search condition
      const condition: any = {};
      if (fieldId) condition.fieldId = fieldId;
      else condition.name = fieldName;

      // Find the field
      const getField = await this.fieldsRepository.findOne({
        where: condition,
      });

      if (!getField) {
        return await APIResponse.error(
          response,
          apiId,
          'Field not found.',
          'NOT_FOUND',
          HttpStatus.NOT_FOUND
        );
      }

      if (softDelete) {
        // Soft delete: mark field as inactive or archived
        // Assuming you have a column like "status" or "isActive" on your Fields table
        const updateResult = await this.fieldsRepository.update(
          { fieldId: getField.fieldId },
          { status: FieldStatus.ARCHIVED } //  enum value here
        );
        return await APIResponse.success(
          response,
          apiId,
          { affected: updateResult.affected },
          HttpStatus.OK,
          'Field soft deleted (archived) successfully.'
        );
      } else {
        // Permanent delete - physically remove the field
        const deleteResult = await this.fieldsRepository.delete({
          fieldId: getField.fieldId,
        });

        if (deleteResult.affected === 0) {
          return await APIResponse.error(
            response,
            apiId,
            'Field not found for deletion.',
            'NOT_FOUND',
            HttpStatus.NOT_FOUND
          );
        }

        // If needed, also delete related data here (e.g., options from other tables)
        return await APIResponse.success(
          response,
          apiId,
          { affected: deleteResult.affected },
          HttpStatus.OK,
          'Field permanently deleted successfully.'
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
    optionName?: any
  ) {
    const orderCond = order || '';
    const offsetCond = offset ? `offset ${offset}` : '';
    const limitCond = limit ? `limit ${limit}` : '';
    let whereCond = `WHERE `;
    whereCond = whereClause ? (whereCond += `${whereClause}`) : '';

    if (optionName) {
      if (whereCond) {
        whereCond += `AND "name" ILike '%${optionName}%'`;
      } else {
        whereCond += `WHERE "name" ILike '%${optionName}%'`;
      }
    } else {
      whereCond += '';
    }

    const query = `SELECT *,COUNT(*) OVER() AS total_count FROM public."${tableName}" ${whereCond} ${orderCond} ${offsetCond} ${limitCond}`;

    const result = await this.fieldsRepository.query(query);
    if (!result) {
      return null;
    }

    return result;
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
      ...(getFields?.includes('All')
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

    const customFields = await this.fieldsRepository.find({ where: condition });
    return customFields;
  }

  async findFieldValues(contextId: string, context: string) {
    let query = '';
    if (context === 'COHORT') {
      query = `SELECT C."cohortId",F."fieldId",F."value" FROM public."Cohort" C 
    LEFT JOIN public."FieldValues" F
    ON C."cohortId" = F."itemId" where C."cohortId" =$1`;
    } else if (context === 'USERS') {
      query = `SELECT U."userId",F."fieldId",F."value" FROM public."Users" U 
    LEFT JOIN public."FieldValues" F
    ON U."userId" = F."itemId" where U."userId" =$1`;
    }

    const result = await this.fieldsRepository.query(query, [contextId]);
    return result;
  }

  async filterUserUsingCustomFields(context: string, stateDistBlockData: any) {
    const searchKey = [];
    let whereCondition = ` WHERE `;
    let index = 0;
    const tableName = '';
    let joinCond = '';

    if (context === 'COHORT') {
      joinCond = `JOIN "Cohort" u ON fv."itemId" = u."cohortId"`;
    } else if (context === 'USERS') {
      joinCond = `JOIN "Users" u ON fv."itemId" = u."userId"`;
    } else {
      joinCond = ``;
    }

    for (const [key, value] of Object.entries(stateDistBlockData)) {
      // Escape key to prevent SQL injection
      const escapedKey = this.escapeSqlLiteral(key);
      searchKey.push(`'${escapedKey}'`);
      if (index > 0) {
        whereCondition += ` AND `;
      }

      // Handle different matching strategies based on field type
      if (Array.isArray(value)) {
        // For array values, create flexible matching for each value
        // This handles both: ["India,United States"] and ["India", "United States"]
        const allConditions = [];

        for (const v of value) {
          // Handle comma-separated values by splitting and matching each part
          const searchTerms = v
            .split(',')
            .map((term) => term.trim())
            .filter((term) => term.length > 0);

          if (searchTerms.length > 1) {
            // If multiple terms in one value, match any of them
            const termConditions = searchTerms.map((term) => {
              // Escape SQL special characters to prevent SQL injection (e.g., "Côte d'Ivoire")
              const escapedTerm = this.escapeSqlLiteral(term);
              // Handle comma-separated database values
              return `(fields->>'${escapedKey}' ILIKE '%${escapedTerm}%' OR fields->>'${escapedKey}' ILIKE '%${escapedTerm},%' OR fields->>'${escapedKey}' ILIKE '%,${escapedTerm}%' OR fields->>'${escapedKey}' ILIKE '%,${escapedTerm},%')`;
            });
            allConditions.push(`(${termConditions.join(' OR ')})`);
          } else {
            // Single term - handle comma-separated database values
            const cleanValue = v.trim();
            // Escape SQL special characters to prevent SQL injection (e.g., "Côte d'Ivoire")
            const escapedValue = this.escapeSqlLiteral(cleanValue);
            allConditions.push(
              `(fields->>'${escapedKey}' ILIKE '%${escapedValue}%' OR fields->>'${escapedKey}' ILIKE '%${escapedValue},%' OR fields->>'${escapedKey}' ILIKE '%,${escapedValue}%' OR fields->>'${escapedKey}' ILIKE '%,${escapedValue},%')`
            );
          }
        }

        whereCondition += `(${allConditions.join(' OR ')})`;
      } else {
        // For single values, use flexible matching (contains, not exact)
        // Escape SQL special characters to prevent SQL injection (e.g., "Côte d'Ivoire")
        const escapedValue = this.escapeSqlLiteral(String(value));
        whereCondition += `fields->>'${escapedKey}' ILIKE '%${escapedValue}%'`;
      }
      index++;
    }

    // First, let's check what fields exist with the given names
    const checkFieldsQuery = `SELECT f."name", f."context", f."fieldId" FROM "Fields" f WHERE f."name" IN (${searchKey})`;

    await this.fieldsValuesRepository.query(checkFieldsQuery);

    // If no fields found, let's check what fields exist that might be similar
    const similarFieldsQuery = `SELECT f."name", f."context", f."fieldId" FROM "Fields" f WHERE f."name" ILIKE '%country%' OR f."name" ILIKE '%COUNTRY%'`;

    await this.fieldsValuesRepository.query(similarFieldsQuery);

    // Let's also check what fields exist in the database
    const allFieldsQuery = `SELECT f."name", f."context", f."fieldId" FROM "Fields" f WHERE f.context IN('USERS', 'NULL', 'null', '') OR f.context IS NULL LIMIT 20`;

    await this.fieldsValuesRepository.query(allFieldsQuery);

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
            ? data.fieldAttributes['isMultiSelect']
            : '',
          maxSelections: data.fieldAttributes
            ? data.fieldAttributes['maxSelections']
            : '',
          type: data?.type || '',
          value: fieldValue || '',
        };

        if (
          requiredFieldOptions == true &&
          (data?.dependsOn == '' || data?.dependsOn == undefined)
        ) {
          if (data?.sourceDetails?.source === 'table') {
            const dynamicOptions = await this.findDynamicOptions(
              data?.sourceDetails?.table
            );
            customField.options = dynamicOptions;
          } else if (data?.sourceDetails?.source === 'jsonFile') {
            const filePath = path.join(
              process.cwd(),
              `${data?.sourceDetails?.filePath}`
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
    return await this.fieldsRepository.query(
      getFieldsAttributesQuery,
      getFieldsAttributesParams
    );
  }

  async updateCustomFields(itemId, data, fieldAttributesAndParams) {
    if (Array.isArray(data.value)) {
      data.value = data.value.join(',');
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
      });
    }
    Object.assign(result, newResult);
    result['correctValue'] = true;
    return result;
  }

  validateFieldValue(field: any, value: any) {
    try {
      const fieldInstance = FieldFactory.createField(
        field.type,
        field.fieldAttributes,
        field.fieldParams
      );

      if (!field?.sourceDetails?.externalsource) {
        return fieldInstance.validate(value);
      } else {
        return true; // Skip validation if externalsource is present
      }

      // const isValid = fieldInstance.validate(value);
      return true;
    } catch (e) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${e.message}`);
      return { error: e };
    }
  }

  getFieldValueForMultiselect(isMultiSelect: boolean, fieldValue: any) {
    if (isMultiSelect) {
      return fieldValue.split(',');
    }
    return fieldValue;
  }

  mappedFields(fieldDataList) {
    const mappedFields: SchemaField[] = fieldDataList.map((field) => {
      const options =
        field.fieldParams?.options?.map((opt) => ({
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
        isHidden: field.fieldAttributes?.isHidden ?? null,
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
        ordering: field.ordering ?? null,
        default: field?.fieldAttributes?.default ?? null,
      };
    });
    return mappedFields;
  }

  /**
   * SECURITY: Escape SQL literals to prevent SQL injection
   * Escapes single quotes by doubling them (PostgreSQL standard)
   * @param value - The string value to escape
   * @returns Escaped string safe for SQL interpolation
   */
  private escapeSqlLiteral(value: string): string {
    if (!value || typeof value !== 'string') return '';
    // Escape single quotes by doubling them (PostgreSQL standard)
    return value.replace(/'/g, "''");
  }
  private readonly COUNTRY_SEPARATOR = '|';
  //COUNTRY_SET need to take from form table in future for TODO
  private normalizeLegacyCountries(value: string): string[] {
    if (!value) return [];

    const input = value.trim();

    // Fast path: already pipe-separated
    if (input.includes(this.COUNTRY_SEPARATOR)) {
      return input
        .split(this.COUNTRY_SEPARATOR)
        .map((v) => v.trim())
        .filter((v) => COUNTRY_SET.has(v));
    }

    const result: string[] = [];
    let remaining = input;

    const countries = Array.from(COUNTRY_SET).sort(
      (a, b) => b.length - a.length
    );

    for (const country of countries) {
      // Exact match (modern or clean legacy)
      if (remaining.includes(country)) {
        result.push(country);
        remaining = remaining.replace(country, '');
        continue;
      }

      // Reconstruct split legacy names (like Bolivia)
      if (country.includes(', ')) {
        const parts = country.split(', ').map((p) => p.trim());

        const allPartsExist = parts.every((part) => remaining.includes(part));

        if (allPartsExist) {
          result.push(country);
          for (const part of parts) {
            remaining = remaining.replace(part, '');
          }
        }
      }
    }

    return result;
  }

  private parseCountries(value?: string): string[] {
    if (!value) return [];

    const parsed = this.normalizeLegacyCountries(value);

    if (parsed.length === 0) {
      LoggerUtil.warn(`Invalid country value: "${value}"`);
    }

    return parsed;
  }

  /* This function Fetches the Custom Field Enteres By User. Here
       Here It convert the Value into Real Option.
       Used in getUserDetails API as of Now.
    */
  public async getUserCustomFieldDetails(
    userId: string,
    fieldOption?: boolean
  ) {
    // Optimized query: Filter FieldValues first, then apply DISTINCT ON
    // This avoids scanning the entire FieldValues table
    const query = `
        SELECT 
          f."fieldId",
          f."label", 
          fv."value", 
          f."type", 
          f."fieldParams",
          f."sourceDetails"
        FROM (
          SELECT DISTINCT ON (fv."fieldId", fv."itemId") 
            fv."fieldId",
            fv."itemId",
            fv."value"
          FROM public."FieldValues" fv
          WHERE fv."itemId" = $1
          ORDER BY fv."fieldId", fv."itemId", fv."createdAt" DESC, fv."fieldValuesId" DESC
        ) fv
        INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
        ORDER BY f."fieldId";
      `;

    let result = await this.fieldsRepository.query(query, [userId]);

    // OPTIMIZED: Batch load dynamic options for table source fields to prevent N+1 queries
    // SECURITY FIX: Escape SQL literals to prevent SQL injection

    const tableSourceFields = result
      .filter((data) => data?.sourceDetails?.source === 'table')
      .map((data) => {
        // SECURITY FIX: Properly escape values to prevent SQL injection
        // Handle multiple comma-separated values correctly
        let whereCondition: string;

        if (!data.value) {
          whereCondition = `value IS NULL`;
        } else if (data.value.includes(',')) {
          // Multiple comma-separated values - use IN clause with escaped values
          const escapedValues = data.value
            .split(',')
            .map((val) => {
              const trimmed = val.trim();
              return trimmed ? `'${this.escapeSqlLiteral(trimmed)}'` : null;
            })
            .filter((v) => v !== null)
            .join(', ');

          if (escapedValues) {
            whereCondition = `"value" IN (${escapedValues})`;
          } else {
            whereCondition = `value IS NULL`;
          }
        } else {
          // Single value - use equality with escaped value
          const escapedValue = this.escapeSqlLiteral(data.value.trim());
          whereCondition = `value='${escapedValue}'`;
        }

        // Generate unique key for batching (must match lookup key exactly)
        // Key generation also needs escaping for consistency
        const keyValue = data.value
          ? data.value
              .split(',')
              .map((val) => {
                const trimmed = val.trim();
                return trimmed ? `'${this.escapeSqlLiteral(trimmed)}'` : '';
              })
              .filter((v) => v)
              .join(', ')
          : '';
        const key = `${data.sourceDetails.table}-${keyValue}`;

        return {
          ...data,
          key, // Unique key for batching
          whereCondition,
        };
      });

    const dynamicOptionsMap = new Map<string, any[]>();
    const uniqueTableQueries = new Map<
      string,
      { table: string; whereCondition: string }
    >();

    // Group unique table/whereCondition combinations
    for (const field of tableSourceFields) {
      if (!uniqueTableQueries.has(field.key)) {
        uniqueTableQueries.set(field.key, {
          table: field.sourceDetails.table,
          whereCondition: field.whereCondition,
        });
      }
    }

    // OPTIMIZED: Batch load all unique table queries with concurrency limiting
    // SECURITY: Concurrency limit prevents thundering herd if uniqueTableQueries.size is large
    const CONCURRENCY_LIMIT = 10; // Limit concurrent queries to prevent database overload

    const batchQueryPromises = Array.from(uniqueTableQueries.entries());

    // Process queries in batches to limit concurrency
    for (let i = 0; i < batchQueryPromises.length; i += CONCURRENCY_LIMIT) {
      const batch = batchQueryPromises.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(
        batch.map(async ([key, { table, whereCondition }]) => {
          const options = await this.findDynamicOptions(table, whereCondition);
          dynamicOptionsMap.set(key, options);
        })
      );
    }

    // Process results with pre-loaded dynamic options
    result = result.map((data) => {
      const originalValue = data.value;
      let processedValue = data.value;

      // Check if this is a country field (by label)
      const isCountryField = data?.label?.toLowerCase().includes('country');

      if (data?.sourceDetails) {
        if (data.sourceDetails.source === 'fieldparams') {
          data.fieldParams.options.forEach((option) => {
            if (data.value === option.value) {
              processedValue = option.value;
            }
          });
        } else if (data.sourceDetails.source === 'table') {
          // Use pre-loaded dynamic options from map
          // SECURITY FIX: Generate key exactly the same way as when storing (must match exactly)
          // Use same escaping logic for key generation
          const keyValue = data.value
            ? data.value
                .split(',')
                .map((val) => {
                  const trimmed = val.trim();
                  return trimmed ? `'${this.escapeSqlLiteral(trimmed)}'` : '';
                })
                .filter((v) => v)
                .join(', ')
            : '';
          const key = `${data.sourceDetails.table}-${keyValue}`;
          const labels = dynamicOptionsMap.get(key);

          if (labels && labels.length > 0) {
            // Extract all names and join them into a string
            processedValue = labels.map((label) => label.name).join(', ');
          }
        }
      }

      delete data.fieldParams;
      delete data.sourceDetails;

      // For country fields, convert value to array
      if (isCountryField) {
        const valueToParse =
          processedValue && processedValue !== originalValue
            ? processedValue
            : originalValue;

        if (valueToParse) {
          processedValue = this.parseCountries(valueToParse);
        } else {
          processedValue = [];
        }
      }

      return {
        ...data,
        value: processedValue,
        code: originalValue,
      };
    });

    return result;
  }

  public async getFieldsByIds(fieldIds: string[]) {
    return this.fieldsRepository.find({
      where: {
        fieldId: In(fieldIds),
      },
    });
  }

  async archiveFieldsByIds(fieldIds: string[], updatedBy: string) {
    try {
      const result = await this.fieldsRepository.update(
        {
          fieldId: In(fieldIds),
        },
        {
          status: FieldStatus.ARCHIVED,
          updatedBy,
        }
      );
      return result;
    } catch (error) {
      throw new Error(`Failed to archive fields: ${error.message}`);
    }
  }

  /**
   * Bulk check if fields already exist in target cohort
   * @param cohortId The target cohort ID
   * @param fieldIds Array of field IDs to check
   * @returns Array of existing field entities
   */
  async getFieldsByContextIdAndFieldIds(
    cohortId: string,
    fieldIds: string[]
  ): Promise<any[]> {
    return await this.fieldsRepository.find({
      where: {
        contextId: cohortId,
        fieldId: In(fieldIds),
        status: FieldStatus.ACTIVE,
      },
    });
  }

  /**
   * Bulk create multiple fields at once
   * @param fieldsData Array of field data to create
   * @returns Array of created field entities
   */
  async bulkCreateFields(fieldsData: any[]): Promise<any[]> {
    if (fieldsData.length === 0) return [];

    // Remove originalFieldId and fieldId from each field data before saving
    const cleanedFieldsData = fieldsData.map((field) => {
      const { originalFieldId, fieldId, ...cleanField } = field;
      return cleanField;
    });

    // Use TypeORM's save method for bulk insert - let any exception propagate
    const result = await this.fieldsRepository.save(cleanedFieldsData);

    // Ensure result is always an array
    return Array.isArray(result) ? result : [result];
  }
}
