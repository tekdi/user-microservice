import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { SuccessResponse } from "src/success-response";
const resolvePath = require("object-resolve-path");
import jwt_decode from "jwt-decode";
import { CohortDto, ReturnResponseBody } from "src/cohort/dto/cohort.dto";
import { CohortSearchDto } from "src/cohort/dto/cohort-search.dto";
import { UserDto } from "src/user/dto/user.dto";
import { CohortCreateDto } from "src/cohort/dto/cohort-create.dto";
import { CohortUpdateDto } from "src/cohort/dto/cohort-update.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { FieldValuesUpdateDto } from "src/fields/dto/field-values-update.dto";
import {
  IsNull,
  Not,
  Repository,
  getConnection,
  getRepository,
  In,
} from "typeorm";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { PostgresFieldsService } from "./fields-adapter";
import { FieldValues } from "../../fields/entities/fields-values.entity";
import { CohortMembers, MemberStatus } from "src/cohortMembers/entities/cohort-member.entity";
import { ErrorResponseTypeOrm } from "src/error-response-typeorm";
import { isUUID } from "class-validator";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
import { PostgresUserService } from "./user-adapter";

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
    private userAapter: PostgresUserService
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
          "BAD_REQUEST",
          `No Cohort Found for this cohort ID`,
          HttpStatus.BAD_REQUEST
        );
      }

      if (requiredData.getChildData) {
        return this.handleChildDataResponse(cohorts, requiredData, res, apiId);
      } else {
        return this.handleCohortDataResponse(cohorts, res, apiId);
      }
    } catch (error) {
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        res,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async handleCohortDataResponse(cohorts, res, apiId) {
    let result = { cohortData: [] };

    for (let data of cohorts) {
      let cohortData = {
        cohortId: data.cohortId,
        name: data.name,
        parentId: data.parentId,
        type: data.type,
        customField: await this.getCohortCustomFieldDetails(data.cohortId),
      };
      result.cohortData.push(cohortData);
    }

    return APIResponse.success(
      res,
      apiId,
      result,
      HttpStatus.OK,
      "Cohort list fetched successfully"
    );
  }

  private async handleChildDataResponse(cohorts, requiredData, res, apiId) {
    let resultDataList = [];

    for (let cohort of cohorts) {
      let resultData = {
        cohortName: cohort.name,
        cohortId: cohort.cohortId,
        parentID: cohort.parentId,
        type: cohort.type,
        customField: requiredData.customField
          ? await this.getCohortCustomFieldDetails(cohort.cohortId)
          : undefined,
        childData: await this.getCohortHierarchy(
          cohort.cohortId,
          requiredData.customField
        ),
      };
      resultDataList.push(resultData);
    }

    return APIResponse.success(
      res,
      apiId,
      resultDataList,
      HttpStatus.OK,
      "Cohort hierarchy fetched successfully"
    );
  }

  async findCohortDetails(cohortId: string) {
    let whereClause: any = { cohortId: cohortId };
    let cohortDetails = await this.cohortRepository.findOne({
      where: whereClause,
    });
    return new ReturnResponseBody(cohortDetails);
  }

  public async getCohortDataWithCustomfield(
    cohortId: string,
    contextType?: string
  ) {
    let context = "COHORT";
    let fieldValue = await this.fieldsService.getFieldValuesData(
      cohortId,
      context,
      contextType,
      ['All'],
      true
    );
    return fieldValue;
  }

  public async findCohortName(userId: any) {
    let query = `SELECT c."name",c."cohortId",c."parentId",c."type"
    FROM public."CohortMembers" AS cm
    LEFT JOIN public."Cohort" AS c ON cm."cohortId" = c."cohortId"
    WHERE cm."userId"=$1 AND c.status='active'`;
    let result = await this.cohortMembersRepository.query(query, [userId]);
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
      f."label", 
      fv."value", 
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
        if (data.sourceDetails.source === "fieldparams") {
          data.fieldParams.options.forEach((option) => {
            if (data.value === option.value) {
              processedValue = option.label;
            }
          });
        } else if (data.sourceDetails.source === "table") {
          let labels = await this.fieldsService.findDynamicOptions(
            data.sourceDetails.table,
            `value='${data.value}'`
          );
          if (labels && labels.length > 0) {
            processedValue = labels[0].label;
          }
        }
      }
  
      delete data.fieldParams;
      delete data.sourceDetails;
      
      return {
        ...data,
        value: processedValue,
        code: originalValue
      };
    });
  
    result = await Promise.all(result);
    return result;
  }

  public async validateFieldValues(field_value_array: string[]) {
    let encounteredKeys = [];
    for (const fieldValue of field_value_array) {
      const [fieldId] = fieldValue.split(":").map((value) => value.trim());
      if (encounteredKeys.includes(fieldId)) {
        return { valid: false, fieldId: fieldId };
      }
      encounteredKeys.push(fieldId);
    }
    return { valid: true, fieldId: "true" };
  }

  public async createCohort(
    request: any,
    cohortCreateDto: CohortCreateDto,
    res
  ) {
    const apiId = APIID.COHORT_CREATE;
    try {
      // Add validation for check both duplicate field ids exist or not
      // and whatever user pass fieldIds is exist in field table or not 
      if (cohortCreateDto.customFields && cohortCreateDto.customFields.length > 0) {
        const validationResponse = await this.fieldsService.validateCustomField(cohortCreateDto);

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

      const decoded: any = jwt_decode(request.headers.authorization);
      cohortCreateDto.createdBy = decoded?.sub;
      cohortCreateDto.updatedBy = decoded?.sub;
      cohortCreateDto.status = cohortCreateDto.status || 'active';
      cohortCreateDto.attendanceCaptureImage = false;

      const existData = await this.cohortRepository.find({
        where: {
          name: cohortCreateDto.name,
          parentId: cohortCreateDto.parentId ? cohortCreateDto.parentId : IsNull(),
        },
      });
      if (existData.length > 0) {
        return APIResponse.error(
          res,
          apiId,
          `Cohort name already exist.Please provide another name.`,
          `Cohort already exists`,
          HttpStatus.CONFLICT
        );
      }

      const response = await this.cohortRepository.save(cohortCreateDto);
      const createFailures = [];

      //SAVE  in fieldValues table
      if (response && cohortCreateDto.customFields && cohortCreateDto.customFields.length > 0) {
        let cohortId = response?.cohortId;
        let contextType = cohortCreateDto?.type ? [cohortCreateDto.type] : [];

        const allCustomFields = await this.fieldsService.findCustomFields("COHORT", contextType)
        if (allCustomFields.length > 0) {
          const customFieldAttributes = allCustomFields.reduce((fieldDetail, { fieldId, fieldAttributes, fieldParams, name }) => fieldDetail[`${fieldId}`] ? fieldDetail : { ...fieldDetail, [`${fieldId}`]: { fieldAttributes, fieldParams, name } }, {});
          for (let fieldValues of cohortCreateDto.customFields) {
            const fieldData = {
              fieldId: fieldValues['fieldId'],
              value: fieldValues['value']
            }
            let resfields = await this.fieldsService.updateCustomFields(cohortId, fieldData, customFieldAttributes[fieldData.fieldId]);
            if (resfields.correctValue) {
              if (!response['customFieldsValue'])
                response['customFieldsValue'] = [];
              response["customFieldsValue"].push(resfields);
            } else {
              createFailures.push(`${fieldData.fieldId}: ${resfields?.valueIssue} - ${resfields.fieldName}`)
            }
          }
        }
      }

      const resBody = new ReturnResponseBody(response);
      return APIResponse.success(
        res,
        apiId,
        resBody,
        HttpStatus.CREATED,
        "Cohort Created Successfully."
      );
    } catch (error) {
      console.log(error, "error");
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        res,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


  public async updateCohort(
    cohortId: string,
    request: any,
    cohortUpdateDto: CohortUpdateDto,
    res
  ) {
    const apiId = APIID.COHORT_UPDATE;
    // Define valid status transitions
    const validTransitions = {
      archived: ['active', 'inactive'],
      active: ['archived', 'inactive'],
      inactive: ['active', 'archived']
    };
    try {
      let field_value_array;
      if (cohortUpdateDto.fieldValues && cohortUpdateDto.fieldValues.trim().length > 0) {
        field_value_array = cohortUpdateDto.fieldValues.split("|");
        let valid = await this.validateFieldValues(field_value_array);
        if (valid && valid?.valid === false) {
          return APIResponse.error(
            res,
            apiId,
            `Duplicate fieldId '${valid.fieldId}' found in fieldValues`,
            `Duplicate fieldId`,
            (HttpStatus.CONFLICT)
          )
        }
      }

      const decoded: any = jwt_decode(request.headers.authorization);
      cohortUpdateDto.updatedBy = decoded?.sub;
      cohortUpdateDto.createdBy = decoded?.sub;

      if (!isUUID(cohortId)) {
        return APIResponse.error(
          res,
          apiId,
          `Please Enter valid cohortId(UUID)`,
          `Invalid cohortId`,
          HttpStatus.CONFLICT
        );
      }

      const checkData = await this.checkIfCohortExist(cohortId);
      const existingCohorDetails = await this.cohortRepository.findOne({
        where: { cohortId: cohortId },
      });

      if (checkData === true) {
        let updateData = {};
        let fieldValueData = {};

        // Iterate over all keys in cohortUpdateDto
        for (let key in cohortUpdateDto) {
          if (
            cohortUpdateDto.hasOwnProperty(key) &&
            cohortUpdateDto[key] !== null
          ) {
            if (key !== "fieldValues") {
              updateData[key] = cohortUpdateDto[key];
            } else {
              fieldValueData[key] = cohortUpdateDto[key];
            }
          }
        }

        if (cohortUpdateDto.name || cohortUpdateDto.parentId) {
          const filterOptions = {
            where: {
              name: cohortUpdateDto.name || existingCohorDetails.name,
              parentId: cohortUpdateDto.parentId || existingCohorDetails.parentId,
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
        const response = await this.cohortRepository.update(cohortId, updateData);

        if (fieldValueData["fieldValues"]) {
          if (field_value_array.length > 0) {
            for (let i = 0; i < field_value_array.length; i++) {
              let fieldValues = field_value_array[i].split(":");
              let fieldId = fieldValues[0] ? fieldValues[0].trim() : "";
              try {
                const fieldVauesRowId =
                  await this.fieldsService.searchFieldValueId(
                    cohortId,
                    fieldId
                  );
                const rowid = fieldVauesRowId.fieldValuesId;

                let fieldValueUpdateDto: FieldValuesUpdateDto = {
                  fieldValuesId: rowid,
                  value: fieldValues[1] ? fieldValues[1].trim() : "",
                };
                await this.fieldsService.updateFieldValues(
                  rowid,
                  fieldValueUpdateDto
                );
              } catch {
                let fieldValueDto: FieldValuesDto = {
                  value: fieldValues[1] ? fieldValues[1].trim() : "",
                  itemId: cohortId,
                  fieldId: fieldValues[0] ? fieldValues[0].trim() : "",
                  createdBy: cohortUpdateDto?.createdBy,
                  updatedBy: cohortUpdateDto?.updatedBy,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                await this.fieldsService.findAndSaveFieldValues(fieldValueDto);
              }
            }
          }
        }
        //Update status of cohort
        if (validTransitions[cohortUpdateDto.status]?.includes(existingCohorDetails.status)) {
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

        return APIResponse.success(
          res,
          apiId,
          response.affected,
          HttpStatus.OK,
          "Cohort updated successfully."
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
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        res,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async searchCohort(
    tenantId: string,
    request: any,
    cohortSearchDto: CohortSearchDto,
    response
  ) {
    const apiId = APIID.COHORT_LIST;
    try {
      let { limit, sort, offset, filters } = cohortSearchDto;

      offset = offset ? offset : 0;
      limit = limit ? limit : 200;

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

      const allowedKeys = ["userId", "cohortId", "name", "parentId"];
      const whereClause = {};

      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (!allowedKeys.includes(key)) {
            return APIResponse.error(
              response,
              apiId,
              `${key} Invalid key`,
              `Invalid filter key`,
              HttpStatus.BAD_REQUEST
            );
          } else {
            if (value === "") {
              emptyValueKeys[key] = value;
              emptyKeysString += (emptyKeysString ? ", " : "") + key;
            } else {
              whereClause[key] = value;
            }
          }
        });
      }

      if (whereClause["parentId"]) {
        whereClause["parentId"] = In(whereClause["parentId"]);
      }

      let results = {
        cohortDetails: [],
      };

      let order = {};
      if (sort && sort.length) {
        order[sort[0]] = ['ASC', 'DESC'].includes(sort[1].toUpperCase()) ? sort[1].toUpperCase() : 'ASC'
      } else {
        order['name'] = 'ASC'
      }

      let count = 0;

      if (whereClause["userId"]) {
        const additionalFields = Object.keys(whereClause).filter(
          (key) => key !== "userId"
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

        let userTenantMapExist = await this.UserTenantMappingRepository.find({
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
            skip: offset,
            order,
          });
        const userExistCohortGroup = data.slice(offset, offset + limit);
        count = totalCount;

        for (let data of userExistCohortGroup) {
          let cohortAllData = await this.cohortRepository.findOne({
            where: {
              cohortId: data?.cohortId,
            },
          });

          let customFieldsData = await this.getCohortDataWithCustomfield(
            data.cohortId
          );
          cohortAllData["customFields"] = customFieldsData;
          results.cohortDetails.push(cohortAllData);
        }
      } else {
        const [data, totalcount] = await this.cohortRepository.findAndCount({
          where: whereClause,
          skip: offset,
          order,
        });

        const cohortData = data.slice(offset, offset + limit);
        count = totalcount;

        for (let data of cohortData) {
          let customFieldsData = await this.getCohortDataWithCustomfield(
            data.cohortId,
            data.type
          );
          data["customFields"] = customFieldsData || [];
          results.cohortDetails.push(data);
        }
      }

      if (results.cohortDetails.length > 0) {
        const totalCount = results.cohortDetails.length;
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

  public async updateCohortStatus(cohortId: string, request: any, response) {
    const apiId = APIID.COHORT_DELETE;
    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      // const createdBy = decoded?.sub;
      const updatedBy = decoded?.sub;

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
        let query = `UPDATE public."Cohort"
        SET "status" = 'archived',
        "updatedBy" = '${updatedBy}'
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
          "Cohort Deleted Successfully."
        );
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

  public async checkIfCohortExist(id: any) {
    const existData = await this.cohortRepository.find({
      where: {
        cohortId: id
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
    customField?: Boolean
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
        customField: customFieldDetails || [],
        childData: childHierarchy,
      });
    }
    return hierarchy;
  }

  public async getCohortHierarchyData(requiredData, res) {
    let apiId = APIID.COHORT_LIST;
    if (!requiredData.getChildData) {
      try {
        let findCohortId = await this.findCohortName(requiredData.userId);
        if (!findCohortId.length) {
          return APIResponse.error(
            res,
            apiId,
            "BAD_REQUEST",
            `No Cohort Found for this User ID`,
            HttpStatus.BAD_REQUEST
          );
        }
        let result = {
          cohortData: [],
        };

        for (let data of findCohortId) {
          let cohortData = {
            cohortId: data.cohortId,
            name: data.name,
            parentId: data.parentId,
            type: data.type,
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
          "Cohort list fetched successfully"
        );
      } catch (error) {
        const errorMessage = error.message || "Internal server error";
        return APIResponse.error(
          res,
          apiId,
          "Internal Server Error",
          errorMessage,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
    if (requiredData.getChildData) {
      try {
        let findCohortId = await this.findCohortName(requiredData.userId);
        if (!findCohortId.length) {
          return APIResponse.error(
            res,
            apiId,
            "BAD_REQUEST",
            `No Cohort Found for this User ID`,
            HttpStatus.BAD_REQUEST
          );
        }
        let resultDataList = [];

        for (let cohort of findCohortId) {
          let resultData = {
            cohortName: cohort.name,
            cohortId: cohort.cohortId,
            parentID: cohort.parentId,
            type: cohort.type,
          };
          if (requiredData.customField) {
            resultData["customField"] = await this.getCohortCustomFieldDetails(
              cohort.cohortId
            );
            resultData["childData"] = await this.getCohortHierarchy(
              cohort.cohortId,
              requiredData.customField
            );
          } else {
            resultData["childData"] = await this.getCohortHierarchy(
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
          "Cohort hierarchy fetched successfully"
        );
      } catch (error) {
        const errorMessage = error.message || "Internal server error";
        return APIResponse.error(
          res,
          apiId,
          "Internal Server Error",
          errorMessage,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }

}
