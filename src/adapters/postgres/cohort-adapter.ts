import { HttpStatus, Injectable } from '@nestjs/common';
import jwt_decode from 'jwt-decode';
import { ReturnResponseBody } from 'src/cohort/dto/cohort.dto';
import { CohortSearchDto } from 'src/cohort/dto/cohort-search.dto';
import { CohortCreateDto } from 'src/cohort/dto/cohort-create.dto';
import { CohortUpdateDto } from 'src/cohort/dto/cohort-update.dto';
import { IsNull, Repository, In, ILike, DataSource, MoreThan, LessThan, MoreThanOrEqual, LessThanOrEqual, Equal, Not } from 'typeorm';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import { Fields } from 'src/fields/entities/fields.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { PostgresFieldsService } from './fields-adapter';
import { FieldValues } from '../../fields/entities/fields-values.entity';
import {
  CohortMembers,
  MemberStatus,
} from 'src/cohortMembers/entities/cohort-member.entity';
import { isUUID } from 'class-validator';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import APIResponse from 'src/common/responses/response';
import { APIID } from 'src/common/utils/api-id.config';
import { CohortAcademicYearService } from './cohortAcademicYear-adapter';
import { PostgresAcademicYearService } from './academicyears-adapter';
import { API_RESPONSES } from '@utils/response.messages';
import { CohortAcademicYear } from 'src/cohortAcademicYear/entities/cohortAcademicYear.entity';
import { PostgresCohortMembersService } from './cohortMembers-adapter';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { User } from 'src/user/entities/user-entity';
import { FieldValueConverter } from 'src/utils/field-value-converter';

@Injectable()
export class PostgresCohortService {
  constructor(
    @InjectRepository(Cohort)
    private cohortRepository: Repository<Cohort>,
    @InjectRepository(CohortMembers)
    private cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(UserTenantMapping)
    private UserTenantMappingRepository: Repository<UserTenantMapping>,
    private fieldsService: PostgresFieldsService,
    private readonly cohortAcademicYearService: CohortAcademicYearService,
    private readonly postgresAcademicYearService: PostgresAcademicYearService,
    private readonly postgresCohortMembersService: PostgresCohortMembersService,
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>
  ) {}

  public async getCohortsDetails(requiredData, res) {
    const apiId = APIID.COHORT_READ;

    // const cohortAcademicYear: any[] =
    //   await this.postgresCohortMembersService.isCohortExistForYear(
    //     requiredData.academicYearId,
    //     requiredData.cohortId
    //   );

    // if (cohortAcademicYear.length !== 1) {
    //   return APIResponse.error(
    //     res,
    //     apiId,
    //     "BAD_REQUEST",
    //     API_RESPONSES.COHORT_NOT_IN_ACADEMIC_YEAR,
    //     HttpStatus.BAD_REQUEST
    //   );
    // }

    try {
      const cohorts = await this.cohortRepository.find({
        where: {
          cohortId: requiredData.cohortId,
        },
      });

      if (!cohorts.length) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.COHORT_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }

      if (requiredData.getChildData) {
        return this.handleChildDataResponse(cohorts, requiredData, res, apiId);
      } else {
        return this.handleCohortDataResponse(cohorts, res, apiId);
      }
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

  private async handleCohortDataResponse(cohorts, res, apiId) {
    const result = { cohortData: [] };

    for (const data of cohorts) {
      const cohortData = {
        cohortId: data.cohortId,
        name: data.name,
        parentId: data.parentId,
        type: data.type,
        status: data.status,
        customField: await this.getCohortCustomFieldDetails(data.cohortId),
      };
      result.cohortData.push(cohortData);
    }
    LoggerUtil.log(API_RESPONSES.COHORT_DATA_RESPONSE);
    return APIResponse.success(
      res,
      apiId,
      result,
      HttpStatus.OK,
      API_RESPONSES.COHORT_LIST
    );
  }

  private async handleChildDataResponse(cohorts, requiredData, res, apiId) {
    const resultDataList = [];

    for (const cohort of cohorts) {
      const resultData = {
        cohortName: cohort.name,
        cohortId: cohort.cohortId,
        parentID: cohort.parentId,
        type: cohort.type,
        status: cohort?.status,
        customField: requiredData.customField
          ? await this.getCohortCustomFieldDetails(cohort.cohortId)
          : undefined,
        childData: await this.getCohortHierarchy(
          cohort.cohortId,
          requiredData.customField
        ),
      };
      resultDataList.push(resultData);

      LoggerUtil.log(API_RESPONSES.CHILD_DATA);
    }

    return APIResponse.success(
      res,
      apiId,
      resultDataList,
      HttpStatus.OK,
      API_RESPONSES.COHORT_HIERARCHY
    );
  }

  public async getCohortDataWithCustomfield(
    cohortId: string,
    contextType?: string
  ) {
    const fieldValues = await this.getCohortCustomFieldDetails(cohortId);
    return fieldValues;
  }

  public async findCohortName(userId: any, academicYearId?: string) {
    const baseQuery = `
                    SELECT 
                      c."name", 
                      c."cohortId", 
                      c."parentId", 
                      c."type", 
                      cm."status" AS cohortmemberstatus, 
                      c."status" AS cohortstatus, 
                      cm."cohortMembershipId"
                  `;

    const additionalFields = academicYearId
      ? `, cay."cohortAcademicYearId", cay."academicYearId"`
      : ``;

    const joins = academicYearId
      ? `
      JOIN public."CohortAcademicYear" cay ON cm."cohortAcademicYearId" = cay."cohortAcademicYearId"
      WHERE cm."userId" = $1 AND cay."academicYearId" = $2
    `
      : `
      LEFT JOIN public."Cohort" AS c ON cm."cohortId" = c."cohortId"
      WHERE cm."userId" = $1
    `;

    const query = `
                  ${baseQuery}
                  ${additionalFields}
                  FROM public."CohortMembers" AS cm
                  JOIN public."Cohort" AS c ON cm."cohortId" = c."cohortId"
                  ${joins}
                `;

    const params = academicYearId ? [userId, academicYearId] : [userId];

    const result = await this.cohortMembersRepository.query(query, params);

    return result;
  }

  //   public async getCohortCustomFieldDetails(cohortId: string) {
  //     let context = 'COHORT';
  //     let fieldValue = await this.fieldsService.getFieldValuesData(cohortId, context, "COHORT", null, true, true);
  //     let results = [];

  //     for (let data of fieldValue) {
  //         let result = {
  //             name: '',
  //             value: ''
  //         };
  //         result.name = data.name;
  //         result.value = data.value;
  //         results.push(result);
  //     }
  //     return results;
  // }

  public async getCohortCustomFieldDetails(
    cohortId: string,
    fieldOption?: boolean
  ) {
    const query = `
    SELECT DISTINCT 
      f."fieldId",
      f."label", 
      COALESCE(
        CASE f."type"
          WHEN 'text' THEN fv."textValue"::text
          WHEN 'number' THEN fv."numberValue"::text
          WHEN 'calendar' THEN fv."calendarValue"::text
          WHEN 'dropdown' THEN fv."dropdownValue"::text
          WHEN 'radio' THEN fv."radioValue"
          WHEN 'checkbox' THEN fv."checkboxValue"::text
          WHEN 'textarea' THEN fv."textareaValue"
          WHEN 'file' THEN fv."fileValue"
        END,
        fv."value"
      ) as "value",
      f."type", 
      f."fieldParams",
      f."sourceDetails"
    FROM public."Cohort" c
    LEFT JOIN (
      SELECT DISTINCT ON (fv."fieldId", fv."itemId") fv.*
      FROM public."FieldValues" fv
    ) fv ON fv."itemId" = c."cohortId"
    INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
    WHERE c."cohortId" = $1;
  `;
    let result = await this.cohortMembersRepository.query(query, [cohortId]);
    result = result.map(async (data) => {
      const originalValue = data.value;
      let processedValue = data.value;

      if (data?.sourceDetails) {
        if (data.sourceDetails.source === 'fieldparams') {
          data.fieldParams.options.forEach((option) => {
            if (data.value === option.value) {
              processedValue = option.label;
            }
          });
        } else if (data.sourceDetails.source === 'table') {
          const labels = await this.fieldsService.findDynamicOptions(
            data.sourceDetails.table,
            `value='${data.value}'`
          );
          if (labels && labels.length > 0) {
            processedValue = labels[0].name;
          }
        }
      }

      delete data.fieldParams;
      delete data.sourceDetails;

      return {
        ...data,
        value: processedValue,
        code: originalValue,
      };
    });

    LoggerUtil.log(API_RESPONSES.COHORT_FIELD_DETAILS);

    result = await Promise.all(result);
    return result;
  }

  public async validateFieldValues(field_value_array: string[]) {
    const encounteredKeys = [];
    for (const fieldValue of field_value_array) {
      const [fieldId] = fieldValue.split(':').map((value) => value.trim());
      if (encounteredKeys.includes(fieldId)) {
        return { valid: false, fieldId: fieldId };
      }
      encounteredKeys.push(fieldId);
    }
    return { valid: true, fieldId: 'true' };
  }

  public async createCohort(cohortCreateDto: CohortCreateDto, res) {
    const apiId = APIID.COHORT_CREATE;
    try {
      // Add validation for check both duplicate field ids exist or not
      // and whatever user pass fieldIds is exist in field table or not

      const academicYearId = cohortCreateDto.academicYearId;
      const tenantId = cohortCreateDto.tenantId;

      // verify if the academic year id is valid
      const academicYear =
        await this.postgresAcademicYearService.getActiveAcademicYear(
          cohortCreateDto.academicYearId,
          tenantId
        );

      if (!academicYear) {
        return APIResponse.error(
          res,
          apiId,
          HttpStatus.NOT_FOUND.toLocaleString(),
          API_RESPONSES.ACADEMICYEAR_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      if (
        cohortCreateDto.customFields &&
        cohortCreateDto.customFields.length > 0
      ) {
        const validationResponse = await this.fieldsService.validateCustomField(
          cohortCreateDto,
          cohortCreateDto.type
        );

        // Check the validation response
        if (!validationResponse.isValid) {
          return APIResponse.error(
            res,
            apiId,
            validationResponse.error,
            'Validation Error',
            HttpStatus.BAD_REQUEST
          );
        }
      }
      cohortCreateDto.status = cohortCreateDto.status || 'active';
      cohortCreateDto.attendanceCaptureImage = false;

      // Normalize and validate date strings to ensure correct timezone handling
      const dateValidationError = this.normalizeCohortDates(
        cohortCreateDto,
        res,
        apiId
      );
      if (dateValidationError) {
        return dateValidationError;
      }

      const existData = await this.cohortRepository.find({
        where: {
          name: cohortCreateDto.name,
          status: 'active',
          type: cohortCreateDto.type,
          parentId: cohortCreateDto.parentId
            ? cohortCreateDto.parentId
            : IsNull(),
        },
      });
      if (existData.length > 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.COHORT_NAME_EXIST,
          API_RESPONSES.COHORT_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      const response = await this.cohortRepository.save(cohortCreateDto);
      const createFailures = [];

      //SAVE  in fieldValues table
      if (
        response &&
        cohortCreateDto.customFields &&
        cohortCreateDto.customFields.length > 0
      ) {
        const cohortId = response?.cohortId;
        if (cohortCreateDto.customFields.length > 0) {
          for (const fieldValues of cohortCreateDto.customFields) {
            const fieldId = fieldValues['fieldId'];
            const value = fieldValues['value'];

            // Get field type from Fields table
            const fieldDetails = await this.fieldsRepository.findOne({
              where: { fieldId: fieldId },
            });

            if (!fieldDetails) {
              createFailures.push(`${fieldId}: Field not found`);
              continue;
            }

            try {
              // Use the utility to prepare field data
              const fieldData = FieldValueConverter.prepareFieldData(
                fieldId,
                value,
                cohortId,
                fieldDetails.type
              );

              // Save to FieldValues table
              await this.fieldValuesRepository
                .createQueryBuilder()
                .insert()
                .into('FieldValues')
                .values(fieldData)
                .execute();

              if (!response['customFieldsValue'])
                response['customFieldsValue'] = [];
              response['customFieldsValue'].push({
                fieldId: fieldId,
                value: value,
                correctValue: true,
                fieldName: fieldDetails.name,
              });
            } catch (error) {
              createFailures.push(
                `${fieldId}: ${error.message} - ${fieldDetails.name}`
              );
            }
          }
        }
      }

      // add the year mapping entry in table with cohortId and academicYearId
      await this.cohortAcademicYearService.insertCohortAcademicYear(
        response.cohortId,
        academicYearId,
        cohortCreateDto.createdBy,
        cohortCreateDto.updatedBy
      );

      const resBody = new ReturnResponseBody({
        ...response,
        academicYearId: academicYearId,
      });
      LoggerUtil.log(API_RESPONSES.CREATE_COHORT);
      return APIResponse.success(
        res,
        apiId,
        resBody,
        HttpStatus.CREATED,
        API_RESPONSES.CREATE_COHORT
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

  public async updateCohort(
    cohortId: string,
    cohortUpdateDto: CohortUpdateDto,
    res
  ) {
    const apiId = APIID.COHORT_UPDATE;
    // Define valid status transitions
    const validTransitions = {
      archived: ['active', 'inactive'],
      active: ['archived', 'inactive'],
      inactive: ['active', 'archived'],
    };
    try {
      if (!isUUID(cohortId)) {
        return APIResponse.error(
          res,
          apiId,
          `Please Enter valid cohortId(UUID)`,
          `Invalid cohortId`,
          HttpStatus.CONFLICT
        );
      }

      // const checkData = await this.checkIfCohortExist(cohortId);
      const existingCohorDetails = await this.cohortRepository.findOne({
        where: { cohortId: cohortId },
      });

      if (existingCohorDetails) {
        const updateData = {};
        const customFields = {};

        //validation  of customFields correct or not
        if (
          cohortUpdateDto.customFields &&
          cohortUpdateDto.customFields.length > 0
        ) {
          const contextType =
            cohortUpdateDto?.type || existingCohorDetails?.type;
          const validationResponse =
            await this.fieldsService.validateCustomField(
              cohortUpdateDto,
              contextType
            );
          if (!validationResponse.isValid) {
            return APIResponse.error(
              res,
              apiId,
              validationResponse.error,
              'Validation Error',
              HttpStatus.BAD_REQUEST
            );
          }
        }

        // validation for name or parent alredy exist or not
        if (cohortUpdateDto.name || cohortUpdateDto.parentId) {
          const filterOptions = {
            where: {
              name: cohortUpdateDto.name || existingCohorDetails.name,
              parentId:
                cohortUpdateDto.parentId || existingCohorDetails.parentId,
            },
          };
          const existData = await this.cohortRepository.find(filterOptions);

          if (existData.length > 0) {
            return APIResponse.error(
              res,
              apiId,
              `Cohort name already exists under the specified parent. Please provide another name or parent.`,
              `Cohort already exists`,
              HttpStatus.CONFLICT
            );
          }
        }

        // Normalize and validate date strings to ensure correct timezone handling
        const dateValidationError = this.normalizeCohortDates(
          cohortUpdateDto,
          res,
          apiId
        );
        if (dateValidationError) {
          return dateValidationError;
        }

        // Iterate over all keys in cohortUpdateDto
        for (const key in cohortUpdateDto) {
          if (
            cohortUpdateDto.hasOwnProperty(key) &&
            cohortUpdateDto[key] !== null
          ) {
            if (key !== 'customFields') {
              updateData[key] = cohortUpdateDto[key];
            } else {
              customFields[key] = cohortUpdateDto[key];
            }
          }
        }

        let response;
        // save cohort detail in cohort table
        if (Object.keys(updateData).length > 0) {
          response = await this.cohortRepository.update(cohortId, updateData);
        }

        //SAVE customFields  in fieldValues table
        if (
          cohortUpdateDto.customFields &&
          cohortUpdateDto.customFields.length > 0
        ) {
          const contextType = cohortUpdateDto.type
            ? [cohortUpdateDto.type]
            : existingCohorDetails?.type
            ? [existingCohorDetails.type]
            : [];

          const allCustomFields = await this.fieldsService.findCustomFields(
            'COHORT',
            contextType
          );

          if (allCustomFields.length > 0) {
            for (const fieldValues of cohortUpdateDto.customFields) {
              const fieldId = fieldValues['fieldId'];
              const value = fieldValues['value'];

              // Get field type from Fields table
              const fieldDetails = await this.fieldsRepository.findOne({
                where: { fieldId: fieldId },
              });

              if (!fieldDetails) {
                continue;
              }

              try {
                // Use the utility to prepare field data
                const fieldData = FieldValueConverter.prepareFieldData(
                  fieldId,
                  value,
                  cohortId,
                  fieldDetails.type
                );

                // Check if field value already exists
                const existingFieldValue =
                  await this.fieldValuesRepository.findOne({
                    where: {
                      itemId: cohortId,
                      fieldId: fieldId,
                    },
                  });

                if (existingFieldValue) {
                  // Update existing field value
                  await this.fieldValuesRepository
                    .createQueryBuilder()
                    .update('FieldValues')
                    .set(fieldData)
                    .where('fieldValuesId = :id', {
                      id: existingFieldValue.fieldValuesId,
                    })
                    .execute();
                } else {
                  // Insert new field value
                  await this.fieldValuesRepository
                    .createQueryBuilder()
                    .insert()
                    .into('FieldValues')
                    .values(fieldData)
                    .execute();
                }
              } catch (error) {
                LoggerUtil.error(
                  `Failed to update/insert field value`,
                  `Error: ${error.message}`,
                  apiId
                );
              }
            }
          }
        }

        //Update status in cohortMember table if exist record corresponding cohortId
        if (
          validTransitions[cohortUpdateDto.status]?.includes(
            existingCohorDetails.status
          )
        ) {
          let memberStatus;
          if (cohortUpdateDto.status === 'archived') {
            memberStatus = MemberStatus.ARCHIVED;
          } else if (cohortUpdateDto.status === 'active') {
            memberStatus = MemberStatus.ACTIVE;
          } else if (cohortUpdateDto.status === 'inactive') {
            memberStatus = MemberStatus.INACTIVE;
          }

          if (memberStatus) {
            await this.cohortMembersRepository.update(
              { cohortId },
              { status: memberStatus, updatedBy: cohortUpdateDto.updatedBy }
            );
          }
        }

        LoggerUtil.log(API_RESPONSES.COHORT_UPDATED_SUCCESSFULLY);
        return APIResponse.success(
          res,
          apiId,
          response?.affected,
          HttpStatus.OK,
          API_RESPONSES.COHORT_UPDATED_SUCCESSFULLY
        );
      } else {
        return APIResponse.error(
          res,
          apiId,
          `Cohort not found`,
          `Cohort not found`,
          HttpStatus.NOT_FOUND
        );
      }
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

  public async searchCohort(
    tenantId: string,
    academicYearId: string,
    cohortSearchDto: CohortSearchDto,
    response
  ) {
    const apiId = APIID.COHORT_LIST;
    try {
      const { sort, filters, includeDisplayValues } = cohortSearchDto;
      let { limit, offset } = cohortSearchDto;
      let cohortsByAcademicYear: CohortAcademicYear[];
      let academicYearMap: Map<string, CohortAcademicYear> = new Map();

      offset = offset || 0;
      limit = limit || 200;

      const emptyValueKeys = {};
      let emptyKeysString = '';

      const MAX_LIMIT = 200;

      // Validate the limit parameter
      if (limit > MAX_LIMIT) {
        return APIResponse.error(
          response,
          apiId,
          `Limit exceeds maximum allowed value of ${MAX_LIMIT}`,
          `Limit exceeded`,
          HttpStatus.BAD_REQUEST
        );
      }

      //Get all cohorts fields
      const cohortAllKeys = this.cohortRepository.metadata.columns.map(
        (column) => column.propertyName
      );

      //Get custom fields
      const getCustomFields = await this.fieldsRepository.find({
        where: [
          { context: In(['COHORT', null, 'null', 'NULL']), contextType: null },
          { context: IsNull(), contextType: IsNull() },
        ],
        select: ['fieldId', 'name', 'label', 'contextType', 'type'],
      });

      // Extract custom field names
      const customFieldsKeys = getCustomFields.map(
        (customFields) => customFields.name
      );

      // Combine the arrays
      const allowedKeys = ['userId', ...cohortAllKeys, ...customFieldsKeys];

      const whereClause = {};
      const searchCustomFields = {};

      if (academicYearId) {
        // check if the tenantId and academic year exist together
        cohortsByAcademicYear =
          await this.cohortAcademicYearService.getCohortsAcademicYear(
            academicYearId,
            tenantId
          );

        if (cohortsByAcademicYear?.length === 0) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR,
            API_RESPONSES.COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR,
            HttpStatus.NOT_FOUND
          );
        }

        academicYearMap = new Map();
        cohortsByAcademicYear?.forEach((item) => {
          academicYearMap.set(`${item.cohortId}|${item.academicYearId}`, item);
        });
      }

      if (filters && Object.keys(filters).length > 0) {
        if (filters?.customFieldsName) {
          Object.entries(filters.customFieldsName).forEach(([key, value]) => {
            if (customFieldsKeys.includes(key)) {
              // Find the field type for this custom field
              const fieldInfo = getCustomFields.find(
                (field) => field.name === key
              );
              if (fieldInfo) {
                if (
                  typeof value === 'object' &&
                  value !== null &&
                  !Array.isArray(value)
                ) {
                  const operator = Object.keys(value)[0];
                  const val = value[operator];
                  const validOperators = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'];
                  if (!validOperators.includes(operator)) {
                    // Skip invalid operators or throw an error
                    return APIResponse.error(
                      response,
                      apiId,
                      `Invalid operator: ${operator}`,
                      `Invalid filter operator`,
                      HttpStatus.BAD_REQUEST
                    );
                  }
                  searchCustomFields[key] = {
                    value: val, // e.g., "2024-01-01"
                    type: null,
                    operator: Object.keys(value)[0], // e.g., "gt"
                  };
                } else {
                  searchCustomFields[key] = {
                    value: value,
                    type: fieldInfo.type,
                  };
                }
              } else {
                searchCustomFields[key] = {
                  value: value,
                  type: null,
                };
              }
            }
          });
        }

        for (const [key, value] of Object.entries(filters)) {
          if (!allowedKeys.includes(key) && key !== 'customFieldsName') {
            return APIResponse.error(
              response,
              apiId,
              `${key} Invalid key`,
              'Invalid filter key',
              HttpStatus.BAD_REQUEST
            );
          }
          if (value === '') {
            emptyValueKeys[key] = value;
            emptyKeysString += (emptyKeysString ? ', ' : '') + key;
          } else if (key === 'name') {
            whereClause[key] = ILike(`%${value}%`);
          } else if (key === 'cohort_startDate' || key === 'cohort_endDate') {
            // Handle date fields with operator support (gt, gte, lt, lte, eq, ne)
            if (
              typeof value === 'object' &&
              value !== null &&
              !Array.isArray(value)
            ) {
              const operatorKeys = Object.keys(value);
              if (operatorKeys.length === 0) {
                return APIResponse.error(
                  response,
                  apiId,
                  `Invalid ${key} filter format. Expected an object with one operator key (gt, gte, lt, lte, eq, ne).`,
                  'Invalid filter format',
                  HttpStatus.BAD_REQUEST
                );
              }
              if (operatorKeys.length > 1) {
                return APIResponse.error(
                  response,
                  apiId,
                  `Invalid ${key} filter format. Only one operator is allowed. Found: ${operatorKeys.join(', ')}`,
                  'Invalid filter format',
                  HttpStatus.BAD_REQUEST
                );
              }
              const operator = operatorKeys[0];
              const dateValue = value[operator];
              const validOperators = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'];

              if (!validOperators.includes(operator)) {
                return APIResponse.error(
                  response,
                  apiId,
                  `Invalid operator: ${operator}. Valid operators are: ${validOperators.join(', ')}`,
                  'Invalid filter operator',
                  HttpStatus.BAD_REQUEST
                );
              }

              // Normalize the date value
              const normalizedDate = this.normalizeDateString(dateValue);
              if (!normalizedDate) {
                return APIResponse.error(
                  response,
                  apiId,
                  `Invalid date value for ${key}: ${dateValue}`,
                  'Invalid date format',
                  HttpStatus.BAD_REQUEST
                );
              }

              // Apply the appropriate TypeORM operator
              switch (operator) {
                case 'gt':
                  whereClause[key] = MoreThan(normalizedDate);
                  break;
                case 'gte':
                  whereClause[key] = MoreThanOrEqual(normalizedDate);
                  break;
                case 'lt':
                  whereClause[key] = LessThan(normalizedDate);
                  break;
                case 'lte':
                  whereClause[key] = LessThanOrEqual(normalizedDate);
                  break;
                case 'eq':
                  whereClause[key] = Equal(normalizedDate);
                  break;
                case 'ne':
                  whereClause[key] = Not(Equal(normalizedDate));
                  break;
              }
            } else {
              // Direct value (no operator) - normalize and use exact match
              const normalizedDate = this.normalizeDateString(value);
              if (!normalizedDate) {
                return APIResponse.error(
                  response,
                  apiId,
                  `Invalid date value for ${key}: ${value}`,
                  'Invalid date format',
                  HttpStatus.BAD_REQUEST
                );
              }
              whereClause[key] = normalizedDate;
            }
          } else if (cohortAllKeys.includes(key)) {
            whereClause[key] = value;
          }
        }
      }

      if (whereClause['parentId']) {
        whereClause['parentId'] = In(whereClause['parentId']);
      }
      if (whereClause['status']) {
        whereClause['status'] = In(whereClause['status']);
      }

      const results = {
        cohortDetails: [],
      };

      const order = {};
      if (sort?.length) {
        order[sort[0]] = ['ASC', 'DESC'].includes(sort[1].toUpperCase())
          ? sort[1].toUpperCase()
          : 'ASC';
      } else {
        order['name'] = 'ASC';
      }

      let count = 0;

      if (whereClause['userId']) {
        const additionalFields = Object.keys(whereClause).filter(
          (key) => key !== 'userId' && key !== 'academicYearId'
        );
        if (additionalFields.length > 0) {
          return APIResponse.error(
            response,
            apiId,
            `When filtering by userId, do not include additional fields`,
            'Invalid filters',
            HttpStatus.BAD_REQUEST
          );
        }

        const userTenantMapExist = await this.UserTenantMappingRepository.find({
          where: {
            tenantId: tenantId,
            userId: whereClause['userId'],
          },
        });
        if (userTenantMapExist.length == 0) {
          return APIResponse.error(
            response,
            apiId,
            `User is not mapped for this tenant`,
            'Invalid combination of userId and tenantId',
            HttpStatus.BAD_REQUEST
          );
        }

        const [data, totalCount] =
          await this.cohortMembersRepository.findAndCount({
            where: whereClause,
          });
        const userExistCohortGroup = data.slice(offset, offset + limit);
        count = totalCount;

        const cohortIds = userExistCohortGroup.map(
          (cohortId) => cohortId.cohortId
        );

        const cohortAllData = await this.cohortRepository.find({
          where: {
            cohortId: In(cohortIds),
          },
          order,
        });

        for (const data of cohortAllData) {
          const customFieldsData = await this.getCohortDataWithCustomfield(
            data.cohortId
          );
          data['customFields'] = customFieldsData;
          const academicYearInfo = academicYearMap.get(
            `${data.cohortId}|${academicYearId}`
          );
          data['academicYearInfo'] = academicYearInfo || null;
          results.cohortDetails.push(data);
        }
      } else {
        let getCohortIdUsingCustomFields;

        if (Object.keys(searchCustomFields).length > 0) {
          const context = 'COHORT';

          // Build parameterized query conditions
          const conditions = [];
          const params = [];
          let paramIndex = 1;

          Object.entries(searchCustomFields).forEach(
            ([key, fieldInfo]: [string, any]) => {
              const fieldDetails = getCustomFields.find((f) => f.name === key);
              if (!fieldDetails) return;

              const value = fieldInfo.value;
              const type = fieldDetails.type?.toLowerCase();
              // Add field name parameter
              params.push(key);
              if (fieldInfo.operator) {
                params.push(value);
                switch (fieldInfo.operator) {
                  case 'lt':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" < $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  case 'lte':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" <= $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  case 'gt':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" > $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  case 'gte':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" >= $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  case 'eq':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" = $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  case 'ne':
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" != $${
                        paramIndex + 1
                      })`
                    );
                    break;
                  default:
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" LIKE $${
                        paramIndex + 1
                      })`
                    );
                }
                paramIndex += 2;
              } else {
                switch (type) {
                  case 'text':
                  case 'textarea':
                  case 'file':
                  case 'radio':
                    params.push(`%${value}%`);
                    conditions.push(
                      `(f."name" = $${paramIndex} AND (fv."${type}Value" ILIKE $${
                        paramIndex + 1
                      } OR fv."value" ILIKE $${paramIndex + 1}))`
                    );
                    paramIndex += 2;
                    break;
                  case 'number':
                    if (!isNaN(parseFloat(value))) {
                      params.push(value);
                      params.push(value.toString());
                      conditions.push(
                        `(f."name" = $${paramIndex} AND (fv."numberValue" = $${
                          paramIndex + 1
                        }::numeric OR fv."value" = $${paramIndex + 2}))`
                      );
                      paramIndex += 3;
                    }
                    break;
                  case 'calendar':
                    params.push(`%${value}%`);
                    conditions.push(
                      `(f."name" = $${paramIndex} AND (fv."calendarValue"::text LIKE $${
                        paramIndex + 1
                      } OR fv."value" LIKE $${paramIndex + 1}))`
                    );
                    paramIndex += 2;
                    break;
                  case 'checkbox': {
                    const boolValue =
                      value === 'true' || value === '1' || value === true;
                    params.push(boolValue);
                    params.push(value.toString());
                    conditions.push(
                      `(f."name" = $${paramIndex} AND (fv."checkboxValue" = $${
                        paramIndex + 1
                      } OR fv."value" = $${paramIndex + 2}))`
                    );
                    paramIndex += 3;
                    break;
                  }
                  case 'dropdown':
                    params.push(`%${value}%`);
                    conditions.push(
                      `(f."name" = $${paramIndex} AND (fv."dropdownValue"::text LIKE $${
                        paramIndex + 1
                      } OR fv."value" LIKE $${paramIndex + 1}))`
                    );
                    paramIndex += 2;
                    break;
                  default:
                    params.push(`%${value}%`);
                    conditions.push(
                      `(f."name" = $${paramIndex} AND fv."value" LIKE $${
                        paramIndex + 1
                      })`
                    );
                    paramIndex += 2;
                    break;
                }
              }
            }
          );

          if (conditions.length === 0) {
            return APIResponse.error(
              response,
              apiId,
              'No valid search conditions',
              'NOT FOUND',
              HttpStatus.NOT_FOUND
            );
          }

          const havingConditions = conditions.map(
            (c) => `COUNT(*) FILTER (WHERE ${c}) > 0`
          );

          const customFieldQuery = `
            SELECT DISTINCT fv."itemId"
            FROM public."FieldValues" fv
            INNER JOIN public."Fields" f ON f."fieldId" = fv."fieldId"
            GROUP BY fv."itemId"
            HAVING ${havingConditions.join(' AND ')}`;

          try {
            getCohortIdUsingCustomFields =
              await this.fieldValuesRepository.query(customFieldQuery, params);
            getCohortIdUsingCustomFields = getCohortIdUsingCustomFields.map(
              (result) => result.itemId
            );

            if (!getCohortIdUsingCustomFields?.length) {
              return APIResponse.error(
                response,
                apiId,
                'No data found',
                'NOT FOUND',
                HttpStatus.NOT_FOUND
              );
            }
          } catch (error) {
            LoggerUtil.error(
              'Error executing custom field query',
              `Error: ${error.message}`,
              apiId
            );
            return APIResponse.error(
              response,
              apiId,
              'Error executing search',
              'INTERNAL_SERVER_ERROR',
              HttpStatus.INTERNAL_SERVER_ERROR
            );
          }
        }

        if (
          getCohortIdUsingCustomFields &&
          getCohortIdUsingCustomFields.length > 0
        ) {
          let cohortIdsByFieldAndAcademicYear;
          if (cohortsByAcademicYear?.length >= 1) {
            cohortIdsByFieldAndAcademicYear = cohortsByAcademicYear.filter(
              ({ cohortId }) => getCohortIdUsingCustomFields.includes(cohortId)
            );
          }
          const cohortIds = cohortIdsByFieldAndAcademicYear?.map(
            ({ cohortId }) => cohortId
          );
          whereClause['cohortId'] = In(cohortIds);
        }

        const [data, totalCount] = await this.cohortRepository.findAndCount({
          where: whereClause,
          order,
        });

        const cohortData = data.slice(offset, offset + limit);
        count = totalCount;

        // Step 1: Get cohortIds for checking form existence
        const cohortIds = cohortData.map((c) => c.cohortId);
        //the cohort Id is present in the Forms Table as contextId will check here
        const {
          createdFormIds: formMappedCohortIds,
          publishedFormIds: formPublishedCohortIds,
        } = await this.getCohortMappedFormId(cohortIds, apiId);

        for (const data of cohortData) {
          const customFieldsData = await this.getCohortDataWithCustomfield(
            data.cohortId,
            data.type
          );

          if (data.type === 'COHORT') {
            const userCount = await this.cohortMembersRepository.count({
              where: { cohortId: data.cohortId, status: MemberStatus.ACTIVE },
            });
            data['youthCount'] = userCount;
          }

          data['customFields'] = customFieldsData || [];

          const academicYearInfo = academicYearMap.get(
            `${data.cohortId}|${academicYearId}`
          );
          data['academicYearInfo'] = academicYearInfo || null;

          // Step 4: Add isFormCreated flag
          data['isFormCreated'] = formMappedCohortIds.has(data.cohortId);
          data['isFormPublished'] = formPublishedCohortIds.has(data.cohortId);

          results.cohortDetails.push(data);
        }
      }

      if (includeDisplayValues === true) {
        const userIds: string[] = Array.from(
          new Set(
            results.cohortDetails
              .map((cohort) => [cohort.createdBy, cohort.updatedBy])
              .flat()
              .filter((id) => typeof id === 'string')
          )
        );

        if (userIds.length > 0) {
          try {
            const userDetails = await this.getUserNamesByIds(userIds);
            results.cohortDetails = results.cohortDetails.map((cohort) => ({
              ...cohort,
              createdByName: cohort.createdBy
                ? userDetails[cohort.createdBy] || null
                : null,
              updatedByName: cohort.updatedBy
                ? userDetails[cohort.updatedBy] || null
                : null,
            }));
          } catch (error) {
            LoggerUtil.error(
              `${API_RESPONSES.SERVER_ERROR}`,
              `Error fetching user names: ${error.message}`,
              apiId
            );
          }
        }
      }

      if (results.cohortDetails.length > 0) {
        return APIResponse.success(
          response,
          apiId,
          { count, results },
          HttpStatus.OK,
          'Cohort details fetched successfully'
        );
      } else {
        return APIResponse.error(
          response,
          apiId,
          `No data found.`,
          'No data found.',
          HttpStatus.NOT_FOUND
        );
      }
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

  // This function checks if the cohortIds are present in the Forms table
  private async getCohortMappedFormId(
    cohortIds: string[],
    apiId?: string
  ): Promise<{ createdFormIds: Set<string>; publishedFormIds: Set<string> }> {
    try {
      const rawForms: Array<{ contextId: string; status: string }> =
        await this.dataSource.query(
          `SELECT DISTINCT "contextId", "status" FROM forms WHERE "contextId" = ANY($1)`,
          [cohortIds]
        );
      const createdFormIds = new Set<string>();
      const publishedFormIds = new Set<string>();

      for (const form of rawForms) {
        createdFormIds.add(form.contextId);
        if (form.status === 'active') {
          publishedFormIds.add(form.contextId);
        }
      }

      return { createdFormIds, publishedFormIds };
    } catch (error) {
      LoggerUtil.error(
        'Error querying forms table',
        `Error: ${error.message}`,
        apiId || 'FORM_QUERY'
      );
      return {
        createdFormIds: new Set(),
        publishedFormIds: new Set(),
      };
    }
  }

  //get user name by id
  async getUserNamesByIds(userIds: string[]): Promise<Record<string, string>> {
    if (!userIds || userIds.length === 0) {
      return {};
    }
    const query = `SELECT U."userId",U."firstName",U."lastName" FROM public."Users" U WHERE U."userId" = ANY($1)`;
    const users = await this.usersRepository.query(query, [userIds]);

    return users.reduce((acc, user) => {
      acc[user.userId] = `${user.firstName} ${user.lastName}`;
      return acc;
    }, {} as Record<string, string>);
  }

  /**
   * Normalizes and validates cohort_startDate and cohort_endDate fields.
   * Handles empty strings explicitly (treats as null/unset).
   * Centralizes date normalization logic for both create and update operations.
   *
   * @param dto - Cohort DTO (create or update) with cohort_startDate and/or cohort_endDate
   * @param res - Express response object
   * @param apiId - API identifier for error responses
   * @returns APIResponse.error if validation fails, null otherwise
   */
  private normalizeCohortDates(
    dto: any,
    res: any,
    apiId: string
  ): any | null {
    // Handle cohort_startDate
    if (dto.cohort_startDate !== undefined && dto.cohort_startDate !== null) {
      // Treat empty strings as null (unset the date)
      if (
        typeof dto.cohort_startDate === 'string' &&
        !dto.cohort_startDate.trim()
      ) {
        dto.cohort_startDate = null;
      } else if (dto.cohort_startDate) {
        const normalizedStartDate = this.normalizeDateString(
          dto.cohort_startDate
        );
        if (!normalizedStartDate) {
          return APIResponse.error(
            res,
            apiId,
            'Invalid cohort_startDate format. Please use valid date format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)',
            'Invalid date format',
            HttpStatus.BAD_REQUEST
          );
        }
        dto.cohort_startDate = normalizedStartDate;
      }
    }

    // Handle cohort_endDate
    if (dto.cohort_endDate !== undefined && dto.cohort_endDate !== null) {
      // Treat empty strings as null (unset the date)
      if (
        typeof dto.cohort_endDate === 'string' &&
        !dto.cohort_endDate.trim()
      ) {
        dto.cohort_endDate = null;
      } else if (dto.cohort_endDate) {
        const normalizedEndDate = this.normalizeDateString(dto.cohort_endDate);
        if (!normalizedEndDate) {
          return APIResponse.error(
            res,
            apiId,
            'Invalid cohort_endDate format. Please use valid date format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)',
            'Invalid date format',
            HttpStatus.BAD_REQUEST
          );
        }
        dto.cohort_endDate = normalizedEndDate;
      }
    }

    return null; // No error
  }

  /**
   * Normalizes date strings to ensure correct timezone handling.
   * Handles multiple date formats similar to how customFields handle calendar dates:
   * - YYYY-MM-DD (date-only) -> YYYY-MM-DDTHH:mm:ssZ
   * - YYYY-MM-DD HH:mm:ss (space-separated) -> YYYY-MM-DDTHH:mm:ss (preserves timezone if present)
   * - YYYY-MM-DDTHH:mm:ssZ (ISO 8601) -> validates and returns as-is
   * This ensures dates are stored correctly without timezone shifts.
   * Returns null if the date is invalid.
   */
  private normalizeDateString(dateString: string): string | null {
    if (!dateString || typeof dateString !== 'string') {
      return dateString || null;
    }

    const trimmed = dateString.trim();
    if (!trimmed) {
      return null;
    }

    // Normalize space-separated format to ISO 8601 format
    let normalized = trimmed;
    if (normalized.includes(' ') && !normalized.includes('T')) {
      normalized = normalized.replace(' ', 'T');
    }

    // Check if it's a date-only string (YYYY-MM-DD format, no time component)
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyPattern.test(normalized)) {
      // Validate the date is actually valid (e.g., rejects February 30, Month 13)
      const testDate = new Date(normalized);
      if (isNaN(testDate.getTime())) {
        LoggerUtil.warn(
          `Invalid date value: ${normalized}`,
          'COHORT_DATE_NORMALIZATION'
        );
        return null;
      }
      // Only normalize date-only strings by appending UTC timezone
      // This ensures the date is stored as the exact date intended
      // Using T00:00:00Z ensures it's treated as UTC midnight
      return `${normalized}T00:00:00Z`;
    }

    // For full datetime strings, validate the format and parseability
    // First, try to parse it as a Date to ensure it's valid
    let testDate = new Date(normalized);
    
    // If parsing fails, try to fix common issues
    if (isNaN(testDate.getTime())) {
      // If it doesn't have timezone info, try adding Z
      if (!normalized.match(/[+-]\d{2}:?\d{2}$/) && !normalized.endsWith('Z')) {
        // Check if it ends with just time (no timezone)
        if (normalized.match(/T\d{2}:\d{2}:\d{2}$/)) {
          const withZ = normalized + 'Z';
          testDate = new Date(withZ);
          if (!isNaN(testDate.getTime())) {
            normalized = withZ;
          }
        }
      }
      
      // If still invalid, check if it's a valid format but with invalid values
      // Validate the format structure
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:?\d{2})?$/;
      if (!isoPattern.test(normalized)) {
        LoggerUtil.warn(
          `Invalid date format: ${dateString}`,
          'COHORT_DATE_NORMALIZATION'
        );
        return null;
      }
      
      // Try parsing one more time
      testDate = new Date(normalized);
      if (isNaN(testDate.getTime())) {
        LoggerUtil.warn(
          `Invalid date value (unparseable): ${dateString}`,
          'COHORT_DATE_NORMALIZATION'
        );
        return null;
      }
    }

    // Additional validation: check if the date components are within valid ranges
    // Extract date parts to validate manually
    const dateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (dateMatch) {
      const [, year, month, day, hour, minute, second] = dateMatch;
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      const hourNum = parseInt(hour, 10);
      const minuteNum = parseInt(minute, 10);
      const secondNum = parseInt(second, 10);

      // Validate ranges
      if (
        monthNum < 1 || monthNum > 12 ||
        dayNum < 1 || dayNum > 31 ||
        hourNum < 0 || hourNum > 23 ||
        minuteNum < 0 || minuteNum > 59 ||
        secondNum < 0 || secondNum > 59
      ) {
        LoggerUtil.warn(
          `Invalid date component values: ${dateString} (month: ${monthNum}, day: ${dayNum}, hour: ${hourNum}, minute: ${minuteNum}, second: ${secondNum})`,
          'COHORT_DATE_NORMALIZATION'
        );
        return null;
      }
    }

    // Return the normalized string (validated and ready for storage)
    return normalized;
  }

  public async updateCohortStatus(cohortId: string, response, userId: string) {
    const apiId = APIID.COHORT_DELETE;
    try {
      if (!isUUID(cohortId)) {
        return APIResponse.error(
          response,
          apiId,
          `Invalid Cohort Id format. It must be a valid UUID`,
          'Invalid cohortId',
          HttpStatus.BAD_REQUEST
        );
      }
      const checkData = await this.checkIfCohortExist(cohortId);

      if (checkData === true) {
        const query = `UPDATE public."Cohort"
        SET "status" = 'archived',
        "updatedBy" = '${userId}'
        WHERE "cohortId" = $1`;
        const affectedrows = await this.cohortRepository.query(query, [
          cohortId,
        ]);
        await this.cohortMembersRepository.delete({ cohortId: cohortId });
        await this.fieldValuesRepository.delete({ itemId: cohortId });

        return APIResponse.success(
          response,
          apiId,
          affectedrows[1],
          HttpStatus.OK,
          'Cohort Deleted Successfully.'
        );
      } else {
        return APIResponse.error(
          response,
          apiId,
          `Cohort not found`,
          'Invalid cohortId',
          HttpStatus.BAD_REQUEST
        );
      }
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

  public async checkIfCohortExist(id: any) {
    const existData = await this.cohortRepository.find({
      where: {
        cohortId: id,
      },
    });
    if (existData.length !== 0) {
      return true;
    } else {
      return false;
    }
  }

  private async getCohortHierarchy(
    parentId: string,
    customField?: boolean
  ): Promise<any> {
    const childData = await this.cohortRepository.find({ where: { parentId } });
    const hierarchy = [];
    let customFieldDetails;
    let childHierarchy;
    for (const data of childData) {
      if (customField) {
        childHierarchy = await this.getCohortHierarchy(
          data.cohortId,
          customField
        );
        customFieldDetails = await this.getCohortCustomFieldDetails(
          data.cohortId
        );
      } else {
        childHierarchy = await this.getCohortHierarchy(data.cohortId);
      }
      hierarchy.push({
        cohortId: data.cohortId,
        name: data.name,
        parentId: data.parentId,
        type: data.type,
        status: data.status,
        customField: customFieldDetails || [],
        childData: childHierarchy,
      });
    }

    LoggerUtil.log(API_RESPONSES.COHORT_HIERARCHY);

    return hierarchy;
  }

  public async getCohortHierarchyData(requiredData, res) {
    // my cohort
    const apiId = APIID.COHORT_LIST;

    const userAcademicYear: any[] =
      await this.postgresCohortMembersService.isUserExistForYear(
        requiredData.academicYearId,
        requiredData.userId
      );

    if (userAcademicYear.length === 0) {
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.BAD_REQUEST,
        API_RESPONSES.USER_NOT_IN_ACADEMIC_YEAR,
        HttpStatus.BAD_REQUEST
      );
    }

    if (!requiredData.getChildData) {
      try {
        const findCohortId = await this.findCohortName(
          requiredData.userId,
          requiredData?.academicYearId
        );
        if (!findCohortId.length) {
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `No Cohort Found for this User ID`,
            HttpStatus.BAD_REQUEST
          );
        }
        const result = {
          cohortData: [],
        };

        for (const data of findCohortId) {
          const cohortData = {
            cohortId: data?.cohortId,
            name: data?.name,
            parentId: data?.parentId,
            type: data?.type,
            cohortMemberStatus: data?.cohortmemberstatus,
            cohortMembershipId: data?.cohortMembershipId,
            cohortStatus: data?.cohortstatus,
            customField: {},
          };
          const getDetails = await this.getCohortCustomFieldDetails(
            data.cohortId
          );
          cohortData.customField = getDetails;
          result.cohortData.push(cohortData);
        }

        return APIResponse.success(
          res,
          apiId,
          result,
          HttpStatus.OK,
          'Cohort list fetched successfully'
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
    if (requiredData.getChildData) {
      try {
        const findCohortId = await this.findCohortName(
          requiredData.userId,
          requiredData?.academicYearId
        );

        if (!findCohortId.length) {
          return APIResponse.error(
            res,
            apiId,
            'BAD_REQUEST',
            `No Cohort Found for this User ID`,
            HttpStatus.BAD_REQUEST
          );
        }
        const resultDataList = [];

        for (const cohort of findCohortId) {
          const resultData = {
            cohortName: cohort?.name,
            cohortId: cohort?.cohortId,
            parentID: cohort?.parentId,
            cohortMemberStatus: cohort?.cohortmemberstatus,
            cohortMembershipId: cohort?.cohortMembershipId,
            cohortStatus: cohort?.cohortstatus,
            type: cohort?.type,
          };
          if (requiredData.customField) {
            resultData['customField'] = await this.getCohortCustomFieldDetails(
              cohort.cohortId
            );
            resultData['childData'] = await this.getCohortHierarchy(
              cohort.cohortId,
              requiredData.customField
            );
          } else {
            resultData['childData'] = await this.getCohortHierarchy(
              cohort.cohortId
            );
          }
          resultDataList.push(resultData);
        }
        return APIResponse.success(
          res,
          apiId,
          resultDataList,
          HttpStatus.OK,
          API_RESPONSES.COHORT_HIERARCHY
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
  }
}

