import { Injectable } from "@nestjs/common";
import { CohortMembersDto } from "src/cohortMembers/dto/cohortMembers.dto";
import { CohortMembersSearchDto } from "src/cohortMembers/dto/cohortMembers-search.dto";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PostgresFieldsService } from "./fields-adapter";
import { HttpStatus } from "@nestjs/common";
import { User } from "src/user/entities/user-entity";
import { CohortMembersUpdateDto } from "src/cohortMembers/dto/cohortMember-update.dto";
import { Fields } from "src/fields/entities/fields.entity";
import { isUUID } from "class-validator";
import { Cohort } from "src/cohort/entities/cohort.entity";
import APIResponse from "src/common/responses/response";
import { response, Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { MemberStatus } from "src/cohortMembers/entities/cohort-member.entity";
import { NotificationRequest } from "@utils/notification.axios";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { PostgresAcademicYearService } from "./academicyears-adapter";
import { API_RESPONSES } from "@utils/response.messages";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { PostgresUserService } from "./user-adapter";
import { isValid } from "date-fns";
import { FieldValuesOptionDto } from "src/user/dto/user-create.dto";

@Injectable()
export class PostgresCohortMembersService {
  constructor(
    @InjectRepository(CohortMembers)
    private cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Cohort)
    private cohortRepository: Repository<Cohort>,
    @InjectRepository(CohortAcademicYear)
    private readonly cohortAcademicYearRespository: Repository<CohortAcademicYear>,
    private readonly academicyearService: PostgresAcademicYearService,
    private readonly notificationRequest: NotificationRequest,
    private fieldsService: PostgresFieldsService,
    private userService: PostgresUserService
  ) { }

  //Get cohort member
  async getCohortMembers(
    cohortId: any,
    tenantId: any,
    fieldvalue: any,
    academicYearId: string,
    res: Response
  ) {
    const apiId = APIID.COHORT_MEMBER_GET;
    try {
      const fieldvalues = fieldvalue?.toLowerCase();

      if (!tenantId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.TANANT_ID_REQUIRED,
          HttpStatus.BAD_REQUEST
        );
      }

      if (!isUUID(cohortId)) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.COHORT_VALID_UUID,
          HttpStatus.BAD_REQUEST
        );
      }

      const cohortAcademicYearMap = await this.isCohortExistForYear(
        academicYearId,
        cohortId
      );
      if (cohortAcademicYearMap.length === 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.ACADEMICYEAR_COHORT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      const cohortAcademicyearId =
        cohortAcademicYearMap[0].cohortAcademicYearId;
      const userDetails = await this.findcohortData(
        cohortId,
        cohortAcademicyearId
      );
      if (userDetails === true) {
        const results = {
          userDetails: [],
        };

        const cohortDetails = await this.getUserDetails(
          cohortId,
          "cohortId",
          fieldvalues,
          cohortAcademicyearId
        );
        results.userDetails.push(cohortDetails);

        return APIResponse.success(
          res,
          apiId,
          results,
          HttpStatus.OK,
          API_RESPONSES.COHORT_MEMBER_GET_SUCCESSFULLY
        );
      } else {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.COHORTMEMBER_NOTFOUND,
          HttpStatus.NOT_FOUND
        );
      }
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      )
      const errorMessage = e.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  async getUserDetails(
    searchId: any,
    searchKey: any,
    fieldShowHide: any,
    cohortAcademicyearId: string
  ) {
    const results = {
      userDetails: [],
    };

    const getUserDetails = await this.findUserName(
      searchId,
      searchKey,
      cohortAcademicyearId
    );

    for (const data of getUserDetails) {
      const userDetails = {
        userId: data?.userId,
        userName: data?.userName,
        name: data?.name,
        role: data?.role,
        district: data?.district,
        state: data?.state,
        mobile: data?.mobile,
      };

      if (fieldShowHide === "true") {
        const fieldValues = await this.getFieldandFieldValues(data.userId);
        userDetails["customField"] = fieldValues;
        results.userDetails.push(userDetails);
      } else {
        results.userDetails.push(userDetails);
      }
    }

    return results;
  }

  async findFilledValues(userId: string) {
    const query = `SELECT U."userId",F."fieldId",F."value" FROM public."Users" U
    LEFT JOIN public."FieldValues" F
    ON U."userId" = F."itemId" where U."userId" =$1`;
    const result = await this.usersRepository.query(query, [userId]);
    return result;
  }

  async findcohortData(cohortId: any, cohortAcademicYearId: string) {
    const whereClause: any = {
      cohortId: cohortId,
      cohortAcademicYearId: cohortAcademicYearId,
    };
    const userDetails = await this.cohortMembersRepository.find({
      where: whereClause,
    });
    if (userDetails.length !== 0) {
      return true;
    } else {
      return false;
    }
  }

  async findCustomFields(role) {
    const customFields = await this.fieldsRepository.find({
      where: {
        context: "USERS",
        contextType: role.toUpperCase(),
      },
    });
    return customFields;
  }

  async getFieldandFieldValues(userId: string) {
    const query = `SELECT Fv."fieldId",F."label" AS FieldName,Fv."value" as FieldValues
    FROM public."FieldValues" Fv
    LEFT JOIN public."Fields" F
    ON F."fieldId" = Fv."fieldId"
    where Fv."itemId" =$1 `;
    const result = await this.usersRepository.query(query, [userId]);
    return result;
  }

  async findUserName(searchData: string, searchKey: any, cohortAcademicYear) {
    let whereCase;
    if (searchKey == "cohortId") {
      whereCase = `where CM."cohortId" =$1`;
    } else {
      whereCase = `where CM."userId" =$1`;
    }
    const query = `SELECT U."userId", U."username", "firstName", "middleName", "lastName",
     U."district", U."state",U."mobile" FROM public."CohortMembers" CM
    LEFT JOIN public."Users" U
    ON CM."userId" = U."userId" ${whereCase}`;

    const result = await this.usersRepository.query(query, [searchData]);
    return result;
  }

  public async searchCohortMembers(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    academicyearId: string,
    res: Response
  ) {
    const apiId = APIID.COHORT_MEMBER_SEARCH;
    try {
      if (!isUUID(tenantId)) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.TENANT_ID_NOTFOUND,
          HttpStatus.BAD_REQUEST
        );
      }

      let { limit, offset } = cohortMembersSearchDto;
      const { sort, filters } = cohortMembersSearchDto;
      offset = offset || 0;
      limit = limit || 0;
      let results = {};
      const where = [];
      const options = [];

      const whereClause = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause[key] = value;
        });
      }

      let cohortYearExistInYear = [],
        userYearExistInYear = [],
        finalExistRecord = [];
      // Check if cohortId exists for passing year
      if (whereClause["cohortId"]) {
        const getYearExistRecord = await this.isCohortExistForYear(
          academicyearId,
          cohortMembersSearchDto.filters.cohortId
        );
        if (getYearExistRecord.length === 0) {
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.COHORT_NOTFOUND,
            API_RESPONSES.NOT_FOUND,
            HttpStatus.NOT_FOUND
          );
        }
        cohortYearExistInYear = getYearExistRecord.map(
          (item) => item.cohortAcademicYearId
        );
        finalExistRecord = [...cohortYearExistInYear];
      }

      // Check if userId exists for passing year
      if (whereClause["userId"]) {
        const getYearExitUser = await this.isUserExistForYear(
          academicyearId,
          cohortMembersSearchDto.filters.userId
        );
        if (getYearExitUser.length === 0) {
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.USER_NOTFOUND,
            API_RESPONSES.NOT_FOUND,
            HttpStatus.NOT_FOUND
          );
        }
        userYearExistInYear = getYearExitUser.map(
          (item) => item.cohortAcademicYearId
        );
        finalExistRecord = [...userYearExistInYear];
      }

      // Validate if both cohortId and userId match in the same academic year
      if (
        whereClause["userId"] &&
        whereClause["cohortId"] &&
        cohortYearExistInYear[0] !== userYearExistInYear[0]
      ) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.COHORT_USER_NOTFOUND,
          API_RESPONSES.NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      // Add cohortAcademicYearId filter if applicable
      if (finalExistRecord.length > 0) {
        whereClause["cohortAcademicYearId"] = finalExistRecord;
      }
      const whereKeys = [
        "cohortId",
        "userId",
        "role",
        "name",
        "status",
        "cohortAcademicYearId",
      ];
      whereKeys.forEach((key) => {
        if (whereClause[key]) {
          where.push([key, whereClause[key]]);
        }
      });

      if (limit) options.push(["limit", limit]);
      if (offset) options.push(["offset", offset]);

      const order = {};
      if (sort) {
        const [sortField, sortOrder] = sort;
        order[sortField] = sortOrder;
      }

      results = await this.getCohortMemberUserDetails(
        where,
        "true",
        options,
        order
      );
      
      if (results["userDetails"].length == 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USER_DETAIL_NOTFOUND,
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        res,
        apiId,
        results,
        HttpStatus.OK,
        API_RESPONSES.COHORT_GET_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      )
      const errorMessage = e.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async isCohortExistForYear(yearId, cohortId) {
    return await this.cohortAcademicYearRespository.find({
      where: { academicYearId: yearId, cohortId: cohortId },
    });
  }

  async isUserExistForYear(yearId, userId) {
    // Join query with yearId, userId, academicYearId on CohortMember and CohortAcademicyear table
    const query = `
        SELECT 
            cm."cohortMembershipId",
            cm."createdAt",
            cm."updatedAt",
            cm."cohortId",
            cm."userId",
            cm."status",
            cm."statusReason",
            cm."cohortAcademicYearId",
            cay."academicYearId"
        FROM 
            public."CohortMembers" cm
        JOIN 
            public."CohortAcademicYear" cay ON cm."cohortAcademicYearId" = cay."cohortAcademicYearId"
        WHERE 
            cm."userId" = $1 AND 
            cay."academicYearId" = $2;
    `;
    const result = await this.cohortMembersRepository.query(query, [
      userId,
      yearId,
    ]);
    return result;
  }

  async getCohortMemberUserDetails(
    where: any,
    fieldShowHide: any,
    options: any,
    order: any
  ) {
    const results = {
      totalCount: 0,
      userDetails: [],
    };

    const getUserDetails = await this.getUsers(where, options, order);

    if (getUserDetails.length > 0) {
      results.totalCount = parseInt(getUserDetails[0].total_count, 10);

      for (const data of getUserDetails) {
        if (fieldShowHide === "false") {
          results.userDetails.push(data);
        } else {
          const fieldValues =
            await this.fieldsService.getCustomFieldDetails(data.userId, 'Users');
          //get data by cohort membership Id
          let fieldValuesForCohort =
            await this.fieldsService.getFieldsAndFieldsValues(
              data.cohortMembershipId
            );
            
          fieldValuesForCohort = fieldValuesForCohort.map((field) => {
            return {
              fieldId: field?.fieldId,
              label: field?.label,
              selectedValues: field?.selectedValues,
              type: field?.type,
            };
          });

          data["customField"] = fieldValues.concat(fieldValuesForCohort);
          results.userDetails.push(data);
        }
      }
    }

    return results;
  }

  public async createCohortMembers(
    loginUser: any,
    cohortMembers: CohortMembersDto,
    res: Response,
    tenantId: string,
    deviceId: string,
    academicyearId: string
  ) {
    const apiId = APIID.COHORT_MEMBER_CREATE;
    try {
      const existUser = await this.usersRepository.find({
        where: {
          userId: cohortMembers.userId,
        },
      });
      if (existUser.length === 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_USERID,
          HttpStatus.BAD_REQUEST
        );
      }
      // check year is live or not
      const academicYear = await this.academicyearService.getActiveAcademicYear(
        academicyearId,
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
      //check this cohort exist this year or not
      const isExistAcademicYear = await this.findCohortAcademicYearId(
        academicyearId,
        cohortMembers
      );
      if (!isExistAcademicYear) {
        return APIResponse.error(
          res,
          apiId,
          HttpStatus.NOT_FOUND.toLocaleString(),
          API_RESPONSES.ACADEMICYEAR_COHORT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      const cohortacAdemicyearId = isExistAcademicYear.cohortAcademicYearId;
      //check user is already exist in this cohort for this year or not
      const existrole = await this.cohortMembersRepository.find({
        where: {
          userId: cohortMembers.userId,
          cohortId: cohortMembers.cohortId,
          cohortAcademicYearId: cohortacAdemicyearId,
        },
      });
      if (existrole.length > 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.CONFLICT,
          `User '${cohortMembers.userId}' is already assigned to cohort '${cohortMembers.cohortId}'.`,
          HttpStatus.CONFLICT
        );
      }

      cohortMembers.createdBy = loginUser;
      cohortMembers.updatedBy = loginUser;
      cohortMembers.cohortAcademicYearId = cohortacAdemicyearId;
      // Create a new CohortMembers entity and populate it with cohortMembers data
      const savedCohortMember = await this.cohortMembersRepository.save(
        cohortMembers
      );

      return APIResponse.success(
        res,
        apiId,
        savedCohortMember,
        HttpStatus.OK,
        API_RESPONSES.COHORTMEMBER_CREATED_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      )
      const errorMessage = e.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findCohortAcademicYearId(academicyearId, cohortMembers) {
    return await this.cohortAcademicYearRespository.findOne({
      where: {
        academicYearId: academicyearId,
        cohortId: cohortMembers.cohortId,
      },
    });
  }

  async getUsers(where: any, options: any, order: any) {
    let whereCase = ``;
    let limit, offset;

    if (where.length > 0) {
      whereCase = "WHERE ";

      const processCondition = ([key, value]) => {
        switch (key) {
          case "role":
            return `R."name"='${value}'`;
          case "status": {
            const statusValues = Array.isArray(value)
              ? value.map((status) => `'${status}'`).join(", ")
              : `'${value}'`;
            return `CM."status" IN (${statusValues})`;
          }
          case "firstName": {
            return `U."firstName" ILIKE '%${value}%'`;
          }
          case "cohortAcademicYearId": {
            const cohortIdAcademicYear = Array.isArray(value)
              ? value.map((id) => `'${id}'`).join(", ")
              : `'${value}'`;
            return `CM."cohortAcademicYearId" IN (${cohortIdAcademicYear})`;
          }
          default: {
            return `CM."${key}"='${value}'`;
          }
        }
      };
      whereCase += where.map(processCondition).join(" AND ");
    }

    let query = `SELECT U."userId", U."username", "firstName", "middleName", "lastName", R."name" AS role, U."mobile",U."deviceId",
      CM."status", CM."statusReason",CM."cohortMembershipId",CM."status",CM."createdAt", CM."updatedAt",U."createdBy",U."updatedBy", COUNT(*) OVER() AS total_count  FROM public."CohortMembers" CM
      INNER JOIN public."Users" U
      ON CM."userId" = U."userId"
      INNER JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      INNER JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCase}`;

    options.forEach((option) => {
      if (option[0] === "limit") {
        limit = option[1];
      }
      if (option[0] === "offset") {
        offset = option[1];
      }
    });

    if (order && Object.keys(order).length > 0) {
      const orderField = Object.keys(order)[0];
      const orderDirection =
        order[orderField].toUpperCase() === "ASC" ? "ASC" : "DESC";
      query += ` ORDER BY U."${orderField}" ${orderDirection}`;
    }

    if (limit !== undefined) {
      query += ` LIMIT ${limit}`;
    }

    if (offset !== undefined) {
      query += ` OFFSET ${offset}`;
    }
    const result = await this.usersRepository.query(query);

    return result;
  }

  public async updateCohortMembers(
    cohortMembershipId: string,
    loginUser: any,
    cohortMembersUpdateDto: CohortMembersUpdateDto,
    res
  ) {
    const apiId = APIID.COHORT_MEMBER_UPDATE;
    try {
      cohortMembersUpdateDto.updatedBy = loginUser;
      if (!isUUID(cohortMembershipId)) {
        return APIResponse.error(
          res,
          apiId,
          "Bad Request",
          "Invalid input: Please Enter a valid UUID for cohortMembershipId.",
          HttpStatus.BAD_REQUEST
        );
      }
      //validate custom fileds
      let customFieldValidate;
      if (
        cohortMembersUpdateDto.customFields &&
        cohortMembersUpdateDto.customFields.length > 0
      ) {
        customFieldValidate =
          await this.fieldsService.validateCustomFieldByContext(
            cohortMembersUpdateDto,
            "COHORTMEMBER",
            "COHORTMEMBER"
          );
        if (!customFieldValidate || !isValid) {
          return APIResponse.error(
            response,
            apiId,
            "BAD_REQUEST",
            `${customFieldValidate}`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      let cohortMembershipToUpdate = await this.cohortMembersRepository.findOne({
        where: { cohortMembershipId: cohortMembershipId },
      });

      if (!cohortMembershipToUpdate) {
        return APIResponse.error(
          res,
          apiId,
          "Not Found",
          "Invalid input: Cohort member not found.",
          HttpStatus.NOT_FOUND
        );
      }
      Object.assign(cohortMembershipToUpdate, cohortMembersUpdateDto);
      let result = await this.cohortMembersRepository.save(
        cohortMembershipToUpdate
      );
      //update custom fields
      let responseForCustomField;
      if (
        cohortMembersUpdateDto.customFields &&
        cohortMembersUpdateDto.customFields.length > 0
      ) {
        const customFields = cohortMembersUpdateDto.customFields;
        delete cohortMembersUpdateDto.customFields;
        Object.assign(cohortMembershipToUpdate, cohortMembersUpdateDto);

        responseForCustomField = await this.processCustomFields(
          customFields,
          cohortMembershipId,
          cohortMembersUpdateDto
        );
        if (result && responseForCustomField.success) {
          return APIResponse.success(
            res,
            apiId,
            [],
            HttpStatus.CREATED,
            API_RESPONSES.COHORTMEMBER_UPDATE_SUCCESSFULLY
          );
        } else {
          const errorMessage =
            responseForCustomField.error || "Internal server error";
          return APIResponse.error(
            res,
            apiId,
            "Internal Server Error",
            errorMessage,
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }
      }
      if (result) {
        return APIResponse.success(
          res,
          apiId,
          [],
          HttpStatus.OK,
          API_RESPONSES.COHORTMEMBER_UPDATE_SUCCESSFULLY
        );
      }
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      )

      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error : ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }


  }

  public async deleteCohortMemberById(
    tenantid: any,
    cohortMembershipId: any,
    res: any
  ) {
    const apiId = APIID.COHORT_MEMBER_DELETE;

    try {
      const cohortMember = await this.cohortMembersRepository.find({
        where: {
          cohortMembershipId: cohortMembershipId,
        },
      });

      if (!cohortMember || cohortMember.length === 0) {
        return APIResponse.error(
          res,
          apiId,
          "Not Found",
          "Invalid input: Cohort member not found.",
          HttpStatus.NOT_FOUND
        );
      }

      const result = await this.cohortMembersRepository.delete(
        cohortMembershipId
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        "Cohort Member deleted Successfully."
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      )
      const errorMessage = e.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async checkUserExist(userId) {
    const existUser = await this.usersRepository.findOne({
      where: {
        userId: userId,
      },
    });
    return existUser;
  }

  public async checkCohortExist(cohortId) {
    const existCohort = await this.cohortRepository.findOne({
      where: {
        cohortId: cohortId,
      },
    });
    if (!existCohort) {
      return false;
    }
    return existCohort;
  }

  public async cohortUserMapping(userId, cohortId, cohortAcademicYearId) {
    const mappingExist = await this.cohortMembersRepository.findOne({
      where: {
        userId: userId,
        cohortId: cohortId,
        cohortAcademicYearId: cohortAcademicYearId,
        status: MemberStatus.ACTIVE,
      },
    });

    return mappingExist;
  }

  public async createBulkCohortMembers(
    loginUser: any,
    cohortMembersDto: {
      userId: string[];
      cohortId: string[];
      removeCohortId?: string[];
    },
    response: Response,
    tenantId: string,
    academicyearId: string
  ) {
    const apiId = APIID.COHORT_MEMBER_CREATE;
    const results = [];
    const errors = [];
    const cohortMembersBase = {
      createdBy: loginUser,
      updatedBy: loginUser,
      tenantId: tenantId,
      // cohortAcademicYearId: academicyearId
    };

    const academicYear = await this.academicyearService.getActiveAcademicYear(
      academicyearId,
      tenantId
    );
    if (!academicYear) {
      return APIResponse.error(
        response,
        apiId,
        HttpStatus.NOT_FOUND.toLocaleString(),
        API_RESPONSES.ACADEMICYEAR_NOT_FOUND,
        HttpStatus.NOT_FOUND
      );
    }

    for (const userId of cohortMembersDto.userId) {
      // why checking from user table because it is possible to make first time part of any cohort
      const userExists = await this.checkUserExist(userId);
      if (!userExists) {
        errors.push(API_RESPONSES.USER_NOTEXIST(userId));
        continue;
      }

      // Handling of Removing Cohort from user
      if (
        cohortMembersDto?.removeCohortId &&
        cohortMembersDto?.removeCohortId.length > 0
      ) {
        for (const removeCohortId of cohortMembersDto.removeCohortId) {
          try {
            const cohortExists = await this.isCohortExistForYear(
              academicyearId,
              removeCohortId
            );
            if (cohortExists.length === 0) {
              errors.push(
                API_RESPONSES.COHORTID_NOTFOUND_FOT_THIS_YEAR(removeCohortId)
              );
              continue;
            }
            const updateCohort = await this.cohortMembersRepository.update(
              {
                userId,
                cohortId: removeCohortId,
                cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
              },
              { status: MemberStatus.ARCHIVED }
            );
            if (updateCohort.affected === 0) {
              results.push({
                message: API_RESPONSES.COHORT_NOTMAPPED_WITH_USER(
                  removeCohortId,
                  userId
                ),
              });
            } else {
              results.push({
                message: API_RESPONSES.COHORT_STATUS_UPDATED_FOR_USER(
                  removeCohortId,
                  userId
                ),
              });
            }
          } catch (error) {
            LoggerUtil.error(
              `${API_RESPONSES.SERVER_ERROR}`,
              `Error: ${error.message}`,
              apiId
            )
            errors.push(
              API_RESPONSES.ERROR_UPDATE_COHORTMEMBER(
                userId,
                removeCohortId,
                error.message
              )
            );
          }
        }
      }

      // Handling of Addition of User in Cohort
      if (
        cohortMembersDto?.cohortId &&
        cohortMembersDto?.cohortId.length > 0
      ) {
        for (const cohortId of cohortMembersDto.cohortId) {
          const cohortMembers = {
            ...cohortMembersBase,
            userId: userId,
            cohortId: cohortId,
          };
          try {
            const cohortExists = await this.isCohortExistForYear(
              academicyearId,
              cohortId
            );
            if (cohortExists.length === 0) {
              errors.push(
                API_RESPONSES.COHORTID_NOTFOUND_FOT_THIS_YEAR(cohortId)
              );
              continue;
            }
            // get active mapping entries
            const mappingExists = await this.cohortUserMapping(
              userId,
              cohortId,
              cohortExists[0].cohortAcademicYearId
            );
            if (mappingExists) {
              // if (mappingExists.status === MemberStatus.ACTIVE) {
              // errors.push(`Mapping already exists for userId ${userId} and cohortId ${cohortId} for this academic year`);
              errors.push(
                API_RESPONSES.MAPPING_EXIST_BW_USER_AND_COHORT(userId, cohortId)
              );
              continue;
            }
            // else if (mappingExists.status === MemberStatus.ARCHIVED) {

            //   const cohortMemberForAcademicYear = {
            //     ...cohortMembers,
            //     cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
            //   };
            //   const result = await this.cohortMembersRepository.save(
            //     cohortMemberForAcademicYear
            //   );
            // const updateCohort = await this.cohortMembersRepository.update(
            //   {
            //     userId,
            //     cohortId,
            //     cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
            //   },
            //   { status: MemberStatus.ACTIVE }
            // );
            //   results.push(result);
            //   continue;
            // }
            // }
            // add new entry
            const cohortMemberForAcademicYear = {
              ...cohortMembers,
              cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
            };
            // Need to add User in cohort for Academic year
            const result = await this.cohortMembersRepository.save(
              cohortMemberForAcademicYear
            );
            results.push(result);
          } catch (error) {
            LoggerUtil.error(
              `${API_RESPONSES.SERVER_ERROR}`,
              `Error: ${error.message}`,
              apiId
            )
            errors.push(
              API_RESPONSES.ERROR_SAVING_COHORTMEMBER(
                userId,
                cohortId,
                error.message
              )
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      return APIResponse.success(
        response,
        APIID.COHORT_MEMBER_CREATE,
        { results, errors },
        HttpStatus.CREATED,
        API_RESPONSES.COHORTMEMBER_ERROR
      );
    }
    return APIResponse.success(
      response,
      APIID.COHORT_MEMBER_CREATE,
      results,
      HttpStatus.CREATED,
      API_RESPONSES.COHORTMEMBER_SUCCESSFULLY
    );
  }

  public async registerFieldValue(
    fieldId: string,
    value: any,
    itemId: string,
    loggedInUserId: string
  ) {
    //create
    const registerResponse = await this.fieldsService.findAndSaveFieldValues({
      createdAt: new Date(),
      updatedAt: new Date(),
      fieldId: fieldId,
      value: value,
      itemId: itemId,
      createdBy: loggedInUserId,
      updatedBy: loggedInUserId,
    });
    //update
    if (!registerResponse) {
      const updateResponse = await this.fieldsService.updateCustomFields(
        itemId,
        {
          updatedAt: new Date(),
          value: JSON.stringify(value),
          fieldId: fieldId,
          updatedBy: loggedInUserId,
        },
        {}
      );
      if (updateResponse) {
        return true;
      } else {
        return false;
      }
    }
  }
  async processCustomFields(
    customFields: FieldValuesOptionDto[],
    cohortMembershipId: string,
    cohortMembersUpdateDto: CohortMembersUpdateDto
  ) {
    try {
      const promises = customFields.map((customField) =>
        this.registerFieldValue(
          customField.fieldId,
          customField.value,
          cohortMembershipId,
          cohortMembersUpdateDto.userId
        )
      );

      const results = await Promise.all(promises);

      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
