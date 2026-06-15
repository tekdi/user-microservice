import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { ReturnResponseBody } from "./dto/cohort-create.dto";
import { CohortSearchDto } from "./dto/cohort-search.dto";
import { CohortCreateDto } from "./dto/cohort-create.dto";
import { CohortUpdateDto } from "./dto/cohort-update.dto";
import { IsNull, Repository, In, ILike, Not } from "typeorm";
import { Cohort } from "./entities/cohort.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { FieldsService } from "src/fields/fields.service";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import {
  CohortMembers,
  MemberStatus,
} from "src/cohortMembers/entities/cohort-member.entity";
import { isUUID } from "class-validator";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
import { CohortAcademicYearService } from "src/cohortAcademicYear/cohortAcademicYear.service";
import { AcademicYearService } from "src/academicyears/academicyears.service";
import { API_RESPONSES } from "@utils/response.messages";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { CohortMembersService } from "src/cohortMembers/cohortMembers.service";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { KafkaService } from "src/kafka/kafka.service";

@Injectable()
export class CohortService {
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
    private fieldsService: FieldsService,
    private readonly cohortAcademicYearService: CohortAcademicYearService,
    private readonly academicYearService: AcademicYearService,
    private readonly cohortMembersService: CohortMembersService,
    private readonly automaticMemberService: AutomaticMemberService,
    private readonly kafkaService: KafkaService
  ) { }

  public async getCohortsDetails(requiredData, res) {
    const apiId = APIID.COHORT_READ;

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
      )
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
        customField: await this.fieldsService.getCustomFieldDetails(data.cohortId, 'Cohort'),
      };
      result.cohortData.push(cohortData);
    }
    LoggerUtil.log(
      API_RESPONSES.COHORT_DATA_RESPONSE,
    )
    return APIResponse.success(
      res,
      apiId,
      result,
      HttpStatus.OK,
      API_RESPONSES.COHORT_LIST,
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
          ? await this.fieldsService.getCustomFieldDetails(cohort.cohortId, 'Cohort')
          : undefined,
        childData: await this.getCohortHierarchy(
          cohort.cohortId,
          requiredData.customField
        ),
      };
      resultDataList.push(resultData);

      LoggerUtil.log(
        API_RESPONSES.CHILD_DATA,
      )
    }

    return APIResponse.success(
      res,
      apiId,
      resultDataList,
      HttpStatus.OK,
      API_RESPONSES.COHORT_HIERARCHY,
    );
  }

  public async getCohortDataWithCustomfield(
    cohortId: string,
    contextType?: string
  ) {
    const fieldValues = await this.fieldsService.getCustomFieldDetails(cohortId, 'Cohort');
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
      const academicYearId = cohortCreateDto.academicYearId;
      const tenantId = cohortCreateDto.tenantId;
      cohortCreateDto.name = cohortCreateDto?.name.toLowerCase();

      // verify if the academic year id is valid
      const academicYear = await this.academicYearService.getActiveAcademicYear(
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

      const hasCustomFields = (cohortCreateDto.customFields?.length ?? 0) > 0;

      if (hasCustomFields) {
        const validationResponse = await this.fieldsService.validateCustomField(
          cohortCreateDto,
          cohortCreateDto.type ?? "COHORT"
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

      cohortCreateDto.status ??= "active";
      cohortCreateDto.attendanceCaptureImage = false;

      // Ensure metadata is a JSON string if provided
      cohortCreateDto.metadata =
        cohortCreateDto.metadata && typeof cohortCreateDto.metadata === 'object'
          ? JSON.stringify(cohortCreateDto.metadata)
          : cohortCreateDto.metadata;

      const response = await this.cohortRepository.save(cohortCreateDto);

      const createFailures = [];

      // SAVE in fieldValues table
      if (response && hasCustomFields) {
        const cohortId = response.cohortId;
        const additionalData = {
          tenantId: tenantId ?? null,
          contextType: cohortCreateDto.type ?? "COHORT",
          createdBy: cohortCreateDto.createdBy ?? null,
          updatedBy: null,
        };

        for (const fieldValues of cohortCreateDto.customFields) {
          const fieldData = {
            fieldId: fieldValues["fieldId"],
            value: fieldValues["value"],
          };

          const resfields = await this.fieldsService.updateCustomFields(
            cohortId,
            fieldData,
            cohortCreateDto.customFields[0].fieldId,
            additionalData
          );

          if (resfields.correctValue) {
            response["customFieldsValue"] ??= [];
            response["customFieldsValue"].push(resfields);
          } else {
            createFailures.push(
              `${fieldData.fieldId}: ${resfields?.valueIssue} - ${resfields.fieldName}`
            );
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

      const resBody = new ReturnResponseBody({ ...response, academicYearId });
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
      this.publishCohortEvent('created', response.cohortId, academicYearId, apiId)
        .catch(error => LoggerUtil.error(
          `Failed to publish cohort created event to Kafka`,
          `Error: ${error.message}`,
          apiId
        ));

      return apiResponse;
    } catch (error) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${error.message}`, apiId);
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        error.message ?? API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async updateCohortStatuses(
    cohortIds: string[],
    status: string,
    updatedBy: string,
    res
  ) {
    const apiId = APIID.COHORT_STATUS_UPDATE;
    try {
      const uniqueCohortIds = [...new Set(cohortIds)];

      const existingCohortsCount = await this.cohortRepository.count({
        where: { cohortId: In(uniqueCohortIds) },
      });

      if (existingCohortsCount !== uniqueCohortIds.length) {
        return APIResponse.error(
          res,
          apiId,
          "One or more cohort IDs do not exist",
          "Invalid cohortId",
          HttpStatus.NOT_FOUND
        );
      }

      const result = await this.cohortRepository.update(
        { cohortId: In(uniqueCohortIds) },
        { status, updatedBy }
      );
      LoggerUtil.log(`Cohort statuses updated: ${result.affected} rows`);
      return APIResponse.success(
        res,
        apiId,
        { affected: result.affected },
        HttpStatus.OK,
        "Cohort statuses updated successfully"
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        error.message || API_RESPONSES.SERVER_ERROR,
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
    const validTransitions = {
      archived: ["active", "inactive"],
      active: ["archived", "inactive"],
      inactive: ["active", "archived"],
    };
    const memberStatusMap = {
      archived: MemberStatus.ARCHIVED,
      active: MemberStatus.ACTIVE,
      inactive: MemberStatus.INACTIVE,
    };
    try {
      if (!isUUID(cohortId)) {
        return APIResponse.error(res, apiId, `Please Enter valid cohortId(UUID)`, `Invalid cohortId`, HttpStatus.CONFLICT);
      }

      const existingCohorDetails = await this.cohortRepository.findOne({ where: { cohortId } });

      if (!existingCohorDetails) {
        return APIResponse.error(res, apiId, `Cohort not found`, `Cohort not found`, HttpStatus.NOT_FOUND);
      }

      const updateData = {};
      const customFields = {};

      const hasCustomFields = (cohortUpdateDto.customFields?.length ?? 0) > 0;

      // Validate custom fields
      if (hasCustomFields) {
        const contextType = cohortUpdateDto?.type ?? existingCohorDetails?.type;
        const validationResponse = await this.fieldsService.validateCustomField(cohortUpdateDto, contextType);
        if (!validationResponse.isValid) {
          return APIResponse.error(res, apiId, validationResponse.error, "Validation Error", HttpStatus.BAD_REQUEST);
        }
      }

      // Validate name/parent uniqueness
      if (cohortUpdateDto.name || cohortUpdateDto.parentId) {
        const existData = await this.cohortRepository.find({
          where: {
            name: cohortUpdateDto.name ?? existingCohorDetails.name,
            parentId: cohortUpdateDto.parentId ?? existingCohorDetails.parentId,
            cohortId: Not(cohortId),
          },
        });
        if (existData.length > 0) {
          return APIResponse.error(res, apiId,
            `Cohort name already exists under the specified parent. Please provide another name or parent.`,
            `Cohort already exists`, HttpStatus.CONFLICT
          );
        }
      }

      // Split DTO keys into updateData vs customFields
      for (const [key, value] of Object.entries(cohortUpdateDto)) {
        if (value !== null && key !== "customFields") {
          updateData[key] = value;
        }
      }

      let response;
      if (Object.keys(updateData).length > 0) {
        response = await this.cohortRepository.update(cohortId, updateData);
      }

      // Save custom fields in fieldValues table
      if (hasCustomFields) {
        let contextType: string[] = [];

        if (cohortUpdateDto.type) {
          contextType = [cohortUpdateDto.type];
        } else if (existingCohorDetails?.type) {
          contextType = [existingCohorDetails.type];
        }

        const allCustomFields = await this.fieldsService.findCustomFields("COHORT", contextType);

        if (allCustomFields.length > 0) {
          const customFieldAttributes = allCustomFields.reduce(
            (fieldDetail, { fieldId, fieldAttributes, fieldParams, name }) =>
              fieldDetail[`${fieldId}`] ? fieldDetail : { ...fieldDetail, [`${fieldId}`]: { fieldAttributes, fieldParams, name } },
            {}
          );
          const additionalData = {
            tenantId: existingCohorDetails.tenantId,
            contextType: existingCohorDetails.type,
            createdBy: existingCohorDetails.createdBy,
            updatedBy: existingCohorDetails.updatedBy,
          };
          for (const fieldValues of cohortUpdateDto.customFields) {
            const fieldData = { fieldId: fieldValues["fieldId"], value: fieldValues["value"] };
            await this.fieldsService.updateCustomFields(cohortId, fieldData, customFieldAttributes[fieldData.fieldId], additionalData);
          }
        }
      }

      // Update cohortMember status if transition is valid
      const memberStatus = validTransitions[cohortUpdateDto.status]?.includes(existingCohorDetails.status)
        ? memberStatusMap[cohortUpdateDto.status]
        : undefined;

      if (memberStatus) {
        await this.cohortMembersRepository.update({ cohortId }, { status: memberStatus, updatedBy: cohortUpdateDto.updatedBy });
      }

      LoggerUtil.log(API_RESPONSES.COHORT_UPDATED_SUCCESSFULLY);

      const apiResponse = APIResponse.success(res, apiId, response?.affected, HttpStatus.OK, API_RESPONSES.COHORT_UPDATED_SUCCESSFULLY);

      this.publishCohortEvent('updated', cohortId, null, apiId)
        .catch(error => LoggerUtil.error(`Failed to publish cohort updated event to Kafka`, `Error: ${error.message}`, apiId));

      return apiResponse;
    } catch (error) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${error.message}`, apiId);
      return APIResponse.error(res, apiId, API_RESPONSES.SERVER_ERROR, error.message ?? API_RESPONSES.SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
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

      offset ??= 0;
      limit ??= 200;

      const emptyValueKeys = {};
      let emptyKeysString = "";
      const MAX_LIMIT = 200;

      if (limit > MAX_LIMIT) {
        return APIResponse.error(response, apiId, `Limit exceeds maximum allowed value of ${MAX_LIMIT}`, `Limit exceeded`, HttpStatus.BAD_REQUEST);
      }

      const cohortAllKeys = this.cohortRepository.metadata.columns.map((column) => column.propertyName);

      const getCustomFields = await this.fieldsRepository.find({
        where: [
          { context: In(["COHORT", null, "null", "NULL"]), contextType: null },
          { context: IsNull(), contextType: IsNull() },
        ],
        select: ["fieldId", "name", "label", "contextType"],
      });
      const customFieldsKeys = getCustomFields.map((customFields) => customFields.name);
      const allowedKeys = ["userId", ...cohortAllKeys, ...customFieldsKeys];

      const whereClause = {};
      const searchCustomFields = {};

      // SECURITY FIX: Always enforce tenantId from headers, not from filters
      whereClause["tenantId"] = tenantId;

      if (academicYearId) {
        cohortsByAcademicYear = await this.cohortAcademicYearService.getCohortsAcademicYear(academicYearId, tenantId);
        if (cohortsByAcademicYear?.length === 0) {
          return APIResponse.error(response, apiId, API_RESPONSES.COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR, API_RESPONSES.COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR, HttpStatus.NOT_FOUND);
        }
      }

      if (filters && Object.keys(filters).length > 0) {
        const cleanedFilters = Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== undefined && value !== null)
        );

        if (cleanedFilters?.customFieldsName) {
          Object.entries(cleanedFilters.customFieldsName).forEach(([key, value]) => {
            if (customFieldsKeys.includes(key)) searchCustomFields[key] = value;
          });
        }

        Object.entries(cleanedFilters).forEach(([key, value]) => {
          if (key === "tenantId") return;
          if (!allowedKeys.includes(key) && key !== "customFieldsName") {
            return APIResponse.error(response, apiId, `${key} Invalid key`, `Invalid filter key`, HttpStatus.BAD_REQUEST);
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

      for (const field of ["parentId", "status", "cohortId"]) {
        if (whereClause[field]) whereClause[field] = In(whereClause[field]);
      }

      const results = { cohortDetails: [] };
      const order: any = sort?.length
        ? { [sort[0]]: ["ASC", "DESC"].includes(sort[1].toUpperCase()) ? sort[1].toUpperCase() : "ASC" }
        : { name: "ASC" };

      let count = 0;

      if (whereClause["userId"]) {
        const additionalFields = Object.keys(whereClause).filter((key) => key !== "userId" && key !== "academicYearId");
        if (additionalFields.length > 0) {
          return APIResponse.error(response, apiId, `When filtering by userId, do not include additional fields`, "Invalid filters", HttpStatus.BAD_REQUEST);
        }

        const userTenantMapExist = await this.UserTenantMappingRepository.find({ where: { tenantId, userId: whereClause["userId"] } });
        if (userTenantMapExist.length == 0) {
          return APIResponse.error(response, apiId, `User is not mapped for this tenant`, "Invalid combination of userId and tenantId", HttpStatus.BAD_REQUEST);
        }

        const [data, totalCount] = await this.cohortMembersRepository.findAndCount({ where: whereClause });
        const userExistCohortGroup = data.slice(offset, offset + limit);
        count = totalCount;

        const cohortIds = userExistCohortGroup.map((cohortId) => cohortId.cohortId);
        const cohortAllData = await this.cohortRepository.find({ where: { cohortId: In(cohortIds) }, order });
        for (const data of cohortAllData) {
          data["customFields"] = await this.getCohortDataWithCustomfield(data.cohortId);
          results.cohortDetails.push(data);
        }
      } else {
        let getCohortIdUsingCustomFields;

        if (Object.keys(searchCustomFields).length > 0) {
          getCohortIdUsingCustomFields = await this.fieldsService.filterUserUsingCustomFieldsOptimized("COHORT", searchCustomFields);
          if (getCohortIdUsingCustomFields == null) {
            return APIResponse.error(response, apiId, "No data found", "NOT FOUND", HttpStatus.NOT_FOUND);
          }
        }

        if (getCohortIdUsingCustomFields?.length > 0 && !whereClause['cohortId']) {
          const cohortIds = cohortsByAcademicYear
            ? cohortsByAcademicYear
              .filter(({ cohortId }) => getCohortIdUsingCustomFields.includes(cohortId))
              .map(({ cohortId }) => cohortId)
            : getCohortIdUsingCustomFields;
          whereClause["cohortId"] = In(cohortIds);
        }

        const [data, totalCount] = await this.cohortRepository.findAndCount({ where: whereClause, order });
        const cohortData = data.slice(offset, offset + limit);
        count = totalCount;

        for (const data of cohortData) {
          data["customFields"] = (await this.getCohortDataWithCustomfield(data.cohortId, data.type)) ?? [];
          results.cohortDetails.push(data);
        }
      }

      return results.cohortDetails.length > 0
        ? APIResponse.success(response, apiId, { count, results }, HttpStatus.OK, "Cohort details fetched successfully")
        : APIResponse.error(response, apiId, `No data found.`, "No data found.", HttpStatus.NOT_FOUND);

    } catch (error) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${error.message}`, apiId);
      return APIResponse.error(response, apiId, API_RESPONSES.SERVER_ERROR, error.message ?? API_RESPONSES.SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
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
        this.publishCohortEvent('deleted', cohortId, null, apiId)
          .catch(error => LoggerUtil.error(
            `Failed to publish cohort deleted event to Kafka`,
            `Error: ${error.message}`,
            apiId
          ));

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
      )
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
          data.cohortId, 'Cohort'
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

    LoggerUtil.log(
      API_RESPONSES.COHORT_HIERARCHY,
    )

    return hierarchy;
  }

  public async getCohortDetailsByIds(ids: string[], academicYearId) {
    return await this.cohortRepository
      .createQueryBuilder('cohort')
      .innerJoin('CohortAcademicYear', 'cay', 'cohort.cohortId = cay.cohortId')
      .where('cohort.cohortId IN (:...ids)', { ids })
      .andWhere('cay.academicYearId = :academicYearId', { academicYearId })
      .select(['cohort.cohortId', 'cohort.name', 'cohort.parentId', 'cohort.type', 'cohort.status'])
      .getMany();
  }

  public async automaticMemberCohortHierarchy(requiredData, academicYearId) {

    if (!requiredData?.rules?.condition) {
      throw new Error('Condition data is missing.');
    }
    const {
      condition: { value, fieldId },
    } = requiredData.rules;

    // Pass fieldId to getSearchFieldValueData
    let filledValues = await this.fieldsService.getSearchFieldValueData(
      0,
      0,
      {
        fieldId: fieldId,
        value: value
      }  // Passing extracted fieldId
    );
    const cohortIds = filledValues.mappedResponse.map(item => item.itemId);

    if (cohortIds.length === 0) {
      throw new Error("No cohort IDs found for the given fieldId and value.");
    }

    const existingCohortIds = await this.getCohortDetailsByIds(cohortIds, academicYearId);
    return existingCohortIds;
  }

  public async getCohortHierarchyData(requiredData, res) {
    const apiId = APIID.COHORT_LIST;

    try {
      const checkAutomaticMember = await this.automaticMemberService.checkMemberById(requiredData.userId);
      let findCohortId;
      if (checkAutomaticMember) {
        findCohortId = await this.automaticMemberCohortHierarchy(checkAutomaticMember, requiredData?.academicYearId);

      } else {
        findCohortId = await this.findCohortName(requiredData.userId, requiredData?.academicYearId);
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
          customField: await this.fieldsService.getCustomFieldDetails(cohort.cohortId, 'Cohort'),
          childData: requiredData.getChildData
            ? await this.getCohortHierarchy(cohort.cohortId, requiredData.customField)
            : []
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
    eventType: 'created' | 'updated' | 'deleted',
    cohortId: string,
    academicYearId: string | null,
    apiId: string
  ): Promise<void> {
    try {
      // For delete events, we may want to include just basic information since the cohort might already be removed
      let cohortData: any;

      if (eventType === 'deleted') {
        cohortData = {
          cohortId: cohortId,
          deletedAt: new Date().toISOString()
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
              "updatedBy"
            ]
          });

          if (!cohort) {
            LoggerUtil.error(`Failed to fetch cohort data for Kafka event`, `Cohort with ID ${cohortId} not found`);
            cohortData = { cohortId };
          } else {
            // Get custom fields for the cohort
            let customFields = [];
            try {
              customFields = await this.fieldsService.getCustomFieldDetails(cohortId, 'Cohort');
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
              eventTimestamp: new Date().toISOString()
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

      await this.kafkaService.publishCohortEvent(eventType, cohortData, cohortId);
      LoggerUtil.log(`Cohort ${eventType} event published to Kafka for cohort ${cohortId}`, apiId);
    } catch (error) {
      LoggerUtil.error(
        `Failed to publish cohort ${eventType} event to Kafka`,
        `Error: ${error.message}`,
        apiId
      );
      // Don't throw the error to avoid affecting the main operation
    }
  }

  /**
   * Get reverse geographical hierarchy for a user based on their cohort assignments
   * @param requiredData - Object containing userId and academicYearId
   * @param res - Response object
   * @returns APIResponse with geographical hierarchy: State -> District -> Block -> Center -> Batch
   */
  public async getUserGeographicalHierarchy(
    requiredData,
    res
  ) {
    const apiId = APIID.COHORT_READ;

    try {
      const { userId, academicYearId, filters, limit, offset } = requiredData;

      if (!userId || !isUUID(userId)) {
        return APIResponse.error(res, apiId, API_RESPONSES.BAD_REQUEST, API_RESPONSES.INVALID_USERID, HttpStatus.NOT_FOUND);
      }

      const paginationLimit = limit ?? 100;
      const paginationOffset = offset ?? 0;

      LoggerUtil.log(`Getting geographical hierarchy for userId: ${userId}, academicYearId: ${academicYearId}`, apiId);

      // Step 1: Get user cohorts
      let userCohorts = await this.findCohortName(userId, academicYearId);
      if (!userCohorts?.length) {
        return APIResponse.error(res, apiId, API_RESPONSES.BAD_REQUEST, API_RESPONSES.COHORT_NOT_FOUND, HttpStatus.NOT_FOUND);
      }

      // Keep only active memberships
      const getMemberStatus = (c: any) => (c.cohortmemberstatus ?? c.cohortMemberStatus ?? "").toString().toLowerCase();
      userCohorts = userCohorts.filter((c) => getMemberStatus(c) === "active");

      // Apply filters to user cohorts if provided
      if (filters && Object.keys(filters).length > 0) {
        const cf = Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== undefined && v !== null)
        ) as Record<string, any>;

        if (cf.parentId?.length > 0)
          userCohorts = userCohorts.filter(c => c.parentId && (cf.parentId as string[]).includes(c.parentId));
        if (cf.cohortId?.length > 0)
          userCohorts = userCohorts.filter(c => (cf.cohortId as string[]).includes(c.cohortId));
        if (typeof cf.type === 'string')
          userCohorts = userCohorts.filter(c => c.type?.toLowerCase() === cf.type.toLowerCase());
        if (cf.status?.length > 0)
          userCohorts = userCohorts.filter(c => (cf.status as string[]).includes(c.status));
        if (typeof cf.name === 'string')
          userCohorts = userCohorts.filter(c => c.name?.toLowerCase().includes(cf.name.toLowerCase()));
      }

      if (userCohorts.length === 0) {
        return APIResponse.error(res, apiId, API_RESPONSES.BAD_REQUEST, API_RESPONSES.COHORT_NOT_FOUND, HttpStatus.NOT_FOUND);
      }

      // Step 2: Collect unique centers from batches / direct center assignments
      const centerBatchMap = new Map<string, any[]>();
      const centerIds = new Set<string>();

      const getOrInit = <V>(map: Map<string, V>, key: string, init: () => V): V => {
        if (!map.has(key)) map.set(key, init());
        return map.get(key);
      };

      for (const cohort of userCohorts) {
        const cohortType = cohort.type?.toLowerCase();
        let centerId: string;

        if (cohortType === 'batch' && cohort.parentId) {
          centerId = cohort.parentId;
          const batches = getOrInit(centerBatchMap, centerId, () => []);
          if (!batches.some((b) => b.batchId === cohort.cohortId)) {
            batches.push({ batchId: cohort.cohortId, batchName: cohort.name });
          }
        } else if (cohortType === 'center' || cohortType === 'cohort') {
          centerId = cohort.cohortId;
          getOrInit(centerBatchMap, centerId, () => []);
        } else {
          continue;
        }
        centerIds.add(centerId);
      }

      if (centerIds.size === 0) {
        return APIResponse.error(res, apiId, API_RESPONSES.BAD_REQUEST, API_RESPONSES.COHORT_NOT_FOUND, HttpStatus.NOT_FOUND);
      }

      // Step 3: Fetch center records and build geoData
      const centers = await this.cohortRepository.find({
        where: { cohortId: In(Array.from(centerIds)) },
        select: ['cohortId', 'name']
      });

      const geoFilters = filters
        ? { state: filters.state, district: filters.district, block: filters.block, village: filters.village, customFieldsName: filters.customFieldsName }
        : null;

      // Map geo dimension names to their geoData id/name keys
      const geoDimensions = [
        { key: 'state', idField: 'stateId', nameField: 'stateName' },
        { key: 'district', idField: 'districtId', nameField: 'districtName' },
        { key: 'block', idField: 'blockId', nameField: 'blockName' },
        { key: 'village', idField: 'villageId', nameField: 'villageName' },
      ];

      const centerGeoDataMap = new Map<string, any>();

      for (const center of centers) {
        const customFields = await this.fieldsService.getCustomFieldDetails(center.cohortId, 'Cohort');
        const geoData: any = {
          stateId: null, stateName: null,
          districtId: null, districtName: null,
          blockId: null, blockName: null,
          villageId: null, villageName: null
        };

        // Extract SDBV from custom fields
        for (const field of customFields) {
          const fieldKey = (field.label ?? field.name)?.toLowerCase();
          const dim = geoDimensions.find(d => d.key === fieldKey);
          const val = field.selectedValues?.[0];
          if (dim && val && typeof val === 'object') {
            geoData[dim.idField] = val.id ?? val.value ?? null;
            geoData[dim.nameField] = val.label ?? val.value ?? null;
          }
        }

        // Apply geo filters
        const shouldInclude = !geoFilters || (
          geoDimensions.every(({ key, idField }) => {
            const filterArr = geoFilters[key];
            return !Array.isArray(filterArr) || filterArr.length === 0 || (geoData[idField] && filterArr.includes(geoData[idField]));
          }) &&
          (!geoFilters.customFieldsName || typeof geoFilters.customFieldsName !== 'object' || await (async () => {
            const matches = await this.fieldsService.filterUserUsingCustomFields('COHORT', geoFilters.customFieldsName);
            return !matches || matches.includes(center.cohortId);
          })())
        );

        if (shouldInclude) {
          centerGeoDataMap.set(center.cohortId, {
            centerId: center.cohortId,
            centerName: center.name,
            ...geoData,
            batches: centerBatchMap.get(center.cohortId) ?? []
          });
        }
      }

      // Step 5: Build reverse geographical hierarchy (state -> district -> block)
      const hierarchyMap = new Map<string, Map<string, Map<string, any[]>>>();

      for (const [, centerData] of centerGeoDataMap.entries()) {
        const stateKey = centerData.stateId ?? 'unknown';
        const districtKey = centerData.districtId ?? 'unknown';
        const blockKey = centerData.blockId ?? 'unknown';

        const stateMap = getOrInit(hierarchyMap, stateKey, () => new Map());
        const districtMap = getOrInit(stateMap, districtKey, () => new Map());
        const blocks = getOrInit(districtMap, blockKey, () => []);

        blocks.push({ centerId: centerData.centerId, centerName: centerData.centerName, batches: centerData.batches });
      }

      // Step 6: Convert map structure to response format
      const result = [];

      for (const [stateId, districtMap] of hierarchyMap.entries()) {
        const firstCenter = Array.from(districtMap.values())[0]?.get(Array.from(Array.from(districtMap.values())[0].keys())[0])?.[0];
        const stateData: any = {
          stateId: stateId === 'unknown' ? null : stateId,
          stateName: centerGeoDataMap.get(firstCenter?.centerId)?.stateName ?? 'Unknown',
          districts: []
        };

        for (const [districtId, blockMap] of districtMap.entries()) {
          const firstBlockCenter = Array.from(blockMap.values())[0]?.[0];
          const districtData: any = {
            districtId: districtId === 'unknown' ? null : districtId,
            districtName: centerGeoDataMap.get(firstBlockCenter?.centerId)?.districtName ?? 'Unknown',
            blocks: []
          };

          for (const [blockId, blockCenters] of blockMap.entries()) {
            const blockData: any = {
              blockId: blockId === 'unknown' ? null : blockId,
              blockName: centerGeoDataMap.get(blockCenters[0]?.centerId)?.blockName ?? 'Unknown',
              centers: blockCenters.map(c => ({
                centerId: c.centerId,
                centerName: c.centerName,
                batches: c.batches ?? []
              }))
            };
            districtData.blocks.push(blockData);
          }
          stateData.districts.push(districtData);
        }
        result.push(stateData);
      }

      // Step 7: Apply pagination
      const totalCount = result.length;
      const paginatedResult = result.slice(paginationOffset, paginationOffset + paginationLimit);

      LoggerUtil.log("User geographical hierarchy fetched successfully", apiId);

      return APIResponse.success(
        res,
        apiId,
        { data: paginatedResult, totalCount, currentPageCount: paginatedResult.length, limit: paginationLimit, offset: paginationOffset },
        HttpStatus.OK,
        "User geographical hierarchy fetched successfully"
      );
    } catch (error) {
      LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, `Error: ${error.message}`, apiId);
      return APIResponse.error(res, apiId, API_RESPONSES.SERVER_ERROR, error.message ?? API_RESPONSES.SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
