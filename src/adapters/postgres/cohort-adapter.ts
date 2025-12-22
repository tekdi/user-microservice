import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { ReturnResponseBody } from "src/cohort/dto/cohort-create.dto";
import { CohortSearchDto } from "src/cohort/dto/cohort-search.dto";
import { CohortCreateDto } from "src/cohort/dto/cohort-create.dto";
import { CohortUpdateDto } from "src/cohort/dto/cohort-update.dto";
import { IsNull, Repository, In, ILike, Not } from "typeorm";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { PostgresFieldsService } from "./fields-adapter";
import { FieldValues } from "../../fields/entities/fields-values.entity";
import {
  CohortMembers,
  MemberStatus,
} from "src/cohortMembers/entities/cohort-member.entity";
import { isUUID } from "class-validator";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
import { CohortAcademicYearService } from "./cohortAcademicYear-adapter";
import { PostgresAcademicYearService } from "./academicyears-adapter";
import { API_RESPONSES } from "@utils/response.messages";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { PostgresCohortMembersService } from "./cohortMembers-adapter";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { KafkaService } from "../../kafka/kafka.service";

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
    private readonly automaticMemberService: AutomaticMemberService,
    private readonly kafkaService: KafkaService
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
        customField: await this.fieldsService.getCustomFieldDetails(
          data.cohortId,
          "Cohort"
        ),
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
        parentId: cohort.parentId,
        type: cohort.type,
        status: cohort?.status,
        customField: requiredData.customField
          ? await this.fieldsService.getCustomFieldDetails(
              cohort.cohortId,
              "Cohort"
            )
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
    const fieldValues = await this.fieldsService.getCustomFieldDetails(
      cohortId,
      "Cohort"
    );
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
                      c."status", 
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

  // public async getCohortCustomFieldDetails(
  //   cohortId: string,
  //   fieldOption?: boolean
  // ) {
  //   const query = `
  //   SELECT DISTINCT
  //     f."fieldId",
  //     f."label",
  //     fv."value",
  //     f."type",
  //     f."fieldParams",
  //     f."sourceDetails"
  //   FROM public."Cohort" c
  //   LEFT JOIN (
  //     SELECT DISTINCT ON (fv."fieldId", fv."itemId") fv.*
  //     FROM public."FieldValues" fv
  //   ) fv ON fv."itemId" = c."cohortId"
  //   INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
  //   WHERE c."cohortId" = $1;
  // `;
  //   let result = await this.cohortMembersRepository.query(query, [cohortId]);
  //   result = result.map(async (data) => {
  //     const originalValue = data.value;
  //     let processedValue = data.value;

  //     if (data?.sourceDetails) {
  //       if (data.sourceDetails.source === "fieldparams") {
  //         data.fieldParams.options.forEach((option) => {
  //           if (data.value === option.value) {
  //             processedValue = option.label;
  //           }
  //         });
  //       } else if (data.sourceDetails.source === "table") {
  //         const labels = await this.fieldsService.findDynamicOptions(
  //           data.sourceDetails.table,
  //           `${data.sourceDetails.table}_id='${data.value}'`
  //         );
  //         if (labels && labels.length > 0) {
  //           const nameKey = Object.keys(labels[0]).find(key => key.endsWith("name"));
  //           if (nameKey) {
  //             processedValue = labels[0][nameKey]?.toLowerCase();
  //           }
  //         }
  //       }
  //     }

  //     delete data.fieldParams;
  //     delete data.sourceDetails;

  //     return {
  //       ...data,
  //       value: processedValue,
  //       code: originalValue,
  //     };
  //   });

  //   LoggerUtil.log(
  //     API_RESPONSES.COHORT_FIELD_DETAILS,
  //   )

  //   result = await Promise.all(result);
  //   return result;
  // }

  public async validateFieldValues(field_value_array: string[]) {
    const encounteredKeys = [];
    for (const fieldValue of field_value_array) {
      const [fieldId] = fieldValue.split(":").map((value) => value.trim());
      if (encounteredKeys.includes(fieldId)) {
        return { valid: false, fieldId: fieldId };
      }
      encounteredKeys.push(fieldId);
    }
    return { valid: true, fieldId: "true" };
  }

  public async createCohort(cohortCreateDto: CohortCreateDto, res) {
    const apiId = APIID.COHORT_CREATE;
    try {
      // Add validation for check both duplicate field ids exist or not
      // and whatever user pass fieldIds is exist in field table or not

      const academicYearId = cohortCreateDto.academicYearId;
      const tenantId = cohortCreateDto.tenantId;
      cohortCreateDto.name = cohortCreateDto?.name.toLowerCase();
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
          "COHORT"
        );

        // Check the validation response
        if (!validationResponse.isValid) {
          return APIResponse.error(
            res,
            apiId,
            validationResponse.error,
            "Validation Error",
            HttpStatus.BAD_REQUEST
          );
        }
      }
      cohortCreateDto.status = cohortCreateDto.status || "active";
      cohortCreateDto.attendanceCaptureImage = false;

      const existData = await this.cohortRepository.find({
        where: {
          name: cohortCreateDto.name,
          status: "active",
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
      console.log("cohortCreateDto: ", cohortCreateDto);
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
            const fieldData = {
              fieldId: fieldValues["fieldId"],
              value: fieldValues["value"],
            };

            const resfields = await this.fieldsService.updateCustomFields(
              cohortId,
              fieldData,
              cohortCreateDto.customFields[0].fieldId
            );
            if (resfields.correctValue) {
              if (!response["customFieldsValue"])
                response["customFieldsValue"] = [];
              response["customFieldsValue"].push(resfields);
            } else {
              createFailures.push(
                `${fieldData.fieldId}: ${resfields?.valueIssue} - ${resfields.fieldName}`
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

      // Send response to the client
      const apiResponse = APIResponse.success(
        res,
        apiId,
        resBody,
        HttpStatus.CREATED,
        API_RESPONSES.CREATE_COHORT
      );

      // Publish cohort created event to Kafka asynchronously - after response is sent to client
      this.publishCohortEvent(
        "created",
        response.cohortId,
        academicYearId,
        apiId
      ).catch((error) =>
        LoggerUtil.error(
          `Failed to publish cohort created event to Kafka`,
          `Error: ${error.message}`,
          apiId
        )
      );

      return apiResponse;
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
      archived: ["active", "inactive"],
      active: ["archived", "inactive"],
      inactive: ["active", "archived"],
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
              "Validation Error",
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
              cohortId: Not(cohortId),
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

        // Iterate over all keys in cohortUpdateDto
        for (const key in cohortUpdateDto) {
          if (
            cohortUpdateDto.hasOwnProperty(key) &&
            cohortUpdateDto[key] !== null
          ) {
            if (key !== "customFields") {
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
            "COHORT",
            contextType
          );

          if (allCustomFields.length > 0) {
            const customFieldAttributes = allCustomFields.reduce(
              (fieldDetail, { fieldId, fieldAttributes, fieldParams, name }) =>
                fieldDetail[`${fieldId}`]
                  ? fieldDetail
                  : {
                      ...fieldDetail,
                      [`${fieldId}`]: { fieldAttributes, fieldParams, name },
                    },
              {}
            );
            for (const fieldValues of cohortUpdateDto.customFields) {
              const fieldData = {
                fieldId: fieldValues["fieldId"],
                value: fieldValues["value"],
              };
              await this.fieldsService.updateCustomFields(
                cohortId,
                fieldData,
                customFieldAttributes[fieldData.fieldId]
              );
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
          if (cohortUpdateDto.status === "archived") {
            memberStatus = MemberStatus.ARCHIVED;
          } else if (cohortUpdateDto.status === "active") {
            memberStatus = MemberStatus.ACTIVE;
          } else if (cohortUpdateDto.status === "inactive") {
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

        // Send response to the client
        const apiResponse = APIResponse.success(
          res,
          apiId,
          response?.affected,
          HttpStatus.OK,
          API_RESPONSES.COHORT_UPDATED_SUCCESSFULLY
        );

        // Publish cohort updated event to Kafka asynchronously - after response is sent to client
        this.publishCohortEvent("updated", cohortId, null, apiId).catch(
          (error) =>
            LoggerUtil.error(
              `Failed to publish cohort updated event to Kafka`,
              `Error: ${error.message}`,
              apiId
            )
        );

        return apiResponse;
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
      const { sort, filters } = cohortSearchDto;
      let { limit, offset } = cohortSearchDto;
      let cohortsByAcademicYear: CohortAcademicYear[];

      offset = offset || 0;
      limit = limit || 200;

      const emptyValueKeys = {};
      let emptyKeysString = "";

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
          { context: In(["COHORT", null, "null", "NULL"]), contextType: null },
          { context: IsNull(), contextType: IsNull() },
        ],
        select: ["fieldId", "name", "label", "contextType"],
      });
      // Extract custom field names
      const customFieldsKeys = getCustomFields.map(
        (customFields) => customFields.name
      );

      // Combine the arrays
      const allowedKeys = ["userId", ...cohortAllKeys, ...customFieldsKeys];

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
      }
      if (filters && Object.keys(filters).length > 0) {
        if (filters?.customFieldsName) {
          Object.entries(filters.customFieldsName).forEach(([key, value]) => {
            if (customFieldsKeys.includes(key)) {
              searchCustomFields[key] = value;
            }
          });
        }
        Object.entries(filters).forEach(([key, value]) => {
          if (!allowedKeys.includes(key) && key !== "customFieldsName") {
            return APIResponse.error(
              response,
              apiId,
              `${key} Invalid key`,
              `Invalid filter key`,
              HttpStatus.BAD_REQUEST
            );
          }
          if (value === "") {
            emptyValueKeys[key] = value;
            emptyKeysString += (emptyKeysString ? ", " : "") + key;
          } else if (key === "name") {
            whereClause[key] = ILike(`%${value}%`);
          } else if (cohortAllKeys.includes(key)) {
            whereClause[key] = value;
          } else if (customFieldsKeys.includes(key)) {
            searchCustomFields[key] = value;
          }
        });
      }

      if (whereClause["parentId"]) {
        whereClause["parentId"] = In(whereClause["parentId"]);
      }
      if (whereClause["status"]) {
        whereClause["status"] = In(whereClause["status"]);
      }

      const results = {
        cohortDetails: [],
      };

      const order = {};
      if (sort?.length) {
        order[sort[0]] = ["ASC", "DESC"].includes(sort[1].toUpperCase())
          ? sort[1].toUpperCase()
          : "ASC";
      } else {
        order["name"] = "ASC";
      }

      let count = 0;

      if (whereClause["userId"]) {
        const additionalFields = Object.keys(whereClause).filter(
          (key) => key !== "userId" && key !== "academicYearId"
        );
        if (additionalFields.length > 0) {
          // Handle the case where userId is provided along with other fields
          return APIResponse.error(
            response,
            apiId,
            `When filtering by userId, do not include additional fields`,
            "Invalid filters",
            HttpStatus.BAD_REQUEST
          );
        }

        const userTenantMapExist = await this.UserTenantMappingRepository.find({
          where: {
            tenantId: tenantId,
            userId: whereClause["userId"],
          },
        });
        if (userTenantMapExist.length == 0) {
          return APIResponse.error(
            response,
            apiId,
            `User is not mapped for this tenant`,
            "Invalid combination of userId and tenantId",
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
          data["customFields"] = customFieldsData;
          results.cohortDetails.push(data);
        }
      } else {
        let getCohortIdUsingCustomFields;

        //If source config in source details from fields table is not exist then return false

        if (Object.keys(searchCustomFields).length > 0) {
          const context = "COHORT";
          getCohortIdUsingCustomFields =
            await this.fieldsService.filterUserUsingCustomFieldsOptimized(
              context,
              searchCustomFields
            );

          if (getCohortIdUsingCustomFields == null) {
            return APIResponse.error(
              response,
              apiId,
              "No data found",
              "NOT FOUND",
              HttpStatus.NOT_FOUND
            );
          }
        }

        if (
          getCohortIdUsingCustomFields &&
          getCohortIdUsingCustomFields.length > 0 &&
          !whereClause["cohortId"]
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
          whereClause["cohortId"] = In(cohortIds);
        }
        // } else if (cohortsByAcademicYear?.length >= 1) {
        //   const cohortIds = cohortsByAcademicYear?.map(
        //     ({ cohortId }) => cohortId
        //   );
        //   whereClause["cohortId"] = In(cohortIds);
        // }

        const [data, totalCount] = await this.cohortRepository.findAndCount({
          where: whereClause,
          order,
        });

        const cohortData = data.slice(offset, offset + limit);
        count = totalCount;

        for (const data of cohortData) {
          const customFieldsData = await this.getCohortDataWithCustomfield(
            data.cohortId,
            data.type
          );
          data["customFields"] = customFieldsData || [];
          results.cohortDetails.push(data);
        }
      }

      if (results.cohortDetails.length > 0) {
        return APIResponse.success(
          response,
          apiId,
          { count, results },
          HttpStatus.OK,
          "Cohort details fetched successfully"
        );
      } else {
        return APIResponse.error(
          response,
          apiId,
          `No data found.`,
          "No data found.",
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

  public async updateCohortStatus(cohortId: string, response, userId: string) {
    const apiId = APIID.COHORT_DELETE;
    try {
      if (!isUUID(cohortId)) {
        return APIResponse.error(
          response,
          apiId,
          `Invalid Cohort Id format. It must be a valid UUID`,
          "Invalid cohortId",
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

        // Send response to the client
        const apiResponse = APIResponse.success(
          response,
          apiId,
          affectedrows[1],
          HttpStatus.OK,
          "Cohort Deleted Successfully."
        );

        // Publish cohort deleted event to Kafka asynchronously - after response is sent to client
        this.publishCohortEvent("deleted", cohortId, null, apiId).catch(
          (error) =>
            LoggerUtil.error(
              `Failed to publish cohort deleted event to Kafka`,
              `Error: ${error.message}`,
              apiId
            )
        );

        return apiResponse;
      } else {
        return APIResponse.error(
          response,
          apiId,
          `Cohort not found`,
          "Invalid cohortId",
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
        customFieldDetails = await this.fieldsService.getCustomFieldDetails(
          data.cohortId,
          "Cohort"
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

  public async getCohortDetailsByIds(ids: string[], academicYearId) {
    return await this.cohortRepository
      .createQueryBuilder("cohort")
      .innerJoin("CohortAcademicYear", "cay", "cohort.cohortId = cay.cohortId")
      .where("cohort.cohortId IN (:...ids)", { ids })
      .andWhere("cay.academicYearId = :academicYearId", { academicYearId })
      .select([
        "cohort.cohortId",
        "cohort.name",
        "cohort.parentId",
        "cohort.type",
        "cohort.status",
      ])
      .getMany();
  }

  public async automaticMemberCohortHierarchy(requiredData, academicYearId) {
    const {
      condition: { value, fieldId },
    } = requiredData?.rules;

    // Pass fieldId to getSearchFieldValueData
    let filledValues = await this.fieldsService.getSearchFieldValueData(
      0,
      "0",
      {
        fieldId: fieldId,
        value: value,
      } // Passing extracted fieldId
    );
    const cohortIds = filledValues.mappedResponse.map((item) => item.itemId);

    if (cohortIds.length === 0) {
      throw new Error("No cohort IDs found for the given fieldId and value.");
    }

    const existingCohortIds = await this.getCohortDetailsByIds(
      cohortIds,
      academicYearId
    );
    return existingCohortIds;
  }

  public async getCohortHierarchyData(requiredData, res) {
    const apiId = APIID.COHORT_LIST;

    try {
      const checkAutomaticMember =
        await this.automaticMemberService.checkMemberById(requiredData.userId);

      let findCohortId;
      if (checkAutomaticMember) {
        findCohortId = await this.automaticMemberCohortHierarchy(
          checkAutomaticMember,
          requiredData?.academicYearId
        );
      } else {
        findCohortId = await this.findCohortName(
          requiredData.userId,
          requiredData?.academicYearId
        );
        if (!findCohortId.length) {
          return APIResponse.error(
            res,
            apiId,
            "BAD_REQUEST",
            `No Cohort Found for this User ID`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const resultDataList = [];

      for (const cohort of findCohortId) {
        const resultData = {
          cohortName: cohort?.name,
          cohortId: cohort?.cohortId,
          parentId: cohort?.parentId,
          cohortMemberStatus: cohort?.cohortmemberstatus,
          cohortMembershipId: cohort?.cohortMembershipId,
          cohortStatus: cohort?.cohortstatus || cohort?.status,
          type: cohort?.type,
          customField: await this.fieldsService.getCustomFieldDetails(
            cohort.cohortId,
            "Cohort"
          ),
          cohortMemberCustomField:
            await this.fieldsService.getCustomFieldDetails(
              cohort.cohortMembershipId,
              "CohortMembers"
            ),
          childData: requiredData.getChildData
            ? await this.getCohortHierarchy(
                cohort.cohortId,
                requiredData.customField
              )
            : [],
        };

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

  /**
   * Publish cohort events to Kafka
   * @param eventType Type of event (created, updated, deleted)
   * @param cohortId Cohort ID for whom the event is published
   * @param apiId API ID for logging
   */
  private async publishCohortEvent(
    eventType: "created" | "updated" | "deleted",
    cohortId: string,
    academicYearId: string | null,
    apiId: string
  ): Promise<void> {
    try {
      // For delete events, we may want to include just basic information since the cohort might already be removed
      let cohortData: any;

      if (eventType === "deleted") {
        cohortData = {
          cohortId: cohortId,
          deletedAt: new Date().toISOString(),
        };
      } else {
        // For create and update, fetch complete data from DB
        try {
          // Get basic cohort information
          const cohort = await this.cohortRepository.findOne({
            where: { cohortId: cohortId },
            select: [
              "cohortId",
              "name",
              "type",
              "status",
              "parentId",
              "tenantId",
              "createdAt",
              "updatedAt",
              "createdBy",
              "updatedBy",
            ],
          });

          if (!cohort) {
            LoggerUtil.error(
              `Failed to fetch cohort data for Kafka event`,
              `Cohort with ID ${cohortId} not found`
            );
            cohortData = { cohortId };
          } else {
            // Get custom fields for the cohort
            let customFields = [];
            try {
              customFields = await this.fieldsService.getCustomFieldDetails(
                cohortId,
                "Cohort"
              );
            } catch (customFieldError) {
              LoggerUtil.error(
                `Failed to fetch custom fields for Kafka event`,
                `Error: ${customFieldError.message}`,
                apiId
              );
              // Don't fail the entire operation if custom fields fetching fails
              customFields = [];
            }

            // Build the cohort data object
            cohortData = {
              ...cohort,
              ...(academicYearId && { academicYearId }),
              customFields: customFields || [],
              eventTimestamp: new Date().toISOString(),
            };
          }
        } catch (error) {
          LoggerUtil.error(
            `Failed to fetch cohort data for Kafka event`,
            `Error: ${error.message}`
          );
          // Return at least the cohortId if we can't fetch complete data
          cohortData = { cohortId };
        }
      }

      await this.kafkaService.publishCohortEvent(
        eventType,
        cohortData,
        cohortId
      );
      LoggerUtil.log(
        `Cohort ${eventType} event published to Kafka for cohort ${cohortId}`,
        apiId
      );
    } catch (error) {
      LoggerUtil.error(
        `Failed to publish cohort ${eventType} event to Kafka`,
        `Error: ${error.message}`,
        apiId
      );
      // Don't throw the error to avoid affecting the main operation
    }
  }
}
