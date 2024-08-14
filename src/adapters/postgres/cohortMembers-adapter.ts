import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { SuccessResponse } from "src/success-response";
import { ErrorResponse } from "src/error-response";
const resolvePath = require("object-resolve-path");
import { CohortMembersDto } from "src/cohortMembers/dto/cohortMembers.dto";
import { CohortMembersSearchDto } from "src/cohortMembers/dto/cohortMembers-search.dto";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository, getConnection, getRepository } from "typeorm";
import { CohortDto } from "src/cohort/dto/cohort.dto";

import { HttpStatus } from "@nestjs/common";
import response from "src/utils/response";
import { User } from "src/user/entities/user-entity";
import { CohortMembersUpdateDto } from "src/cohortMembers/dto/cohortMember-update.dto";
import { ErrorResponseTypeOrm } from "src/error-response-typeorm";
import { Fields } from "src/fields/entities/fields.entity";
import { UUID } from "typeorm/driver/mongodb/bson.typings";
import { isUUID } from "class-validator";
import { Cohort } from "src/cohort/entities/cohort.entity";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from 'src/common/utils/api-id.config';
import { MemberStatus } from "src/cohortMembers/entities/cohort-member.entity";
import { NotificationRequest } from "@utils/notification.axios";


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
    private readonly notificationRequest: NotificationRequest

  ) { }

  //Get cohort member 
  async getCohortMembers(cohortId: any, tenantId: any, fieldvalue: any, res: Response) {
    const apiId = APIID.COHORT_MEMBER_GET
    try {
      const fieldvalues = fieldvalue?.toLowerCase()

      if (!tenantId) {
        return APIResponse.error(res, apiId, "Bad Request", `TenantId required`, HttpStatus.BAD_REQUEST);
      }

      if (!isUUID(cohortId)) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: CohortId must be a valid UUID.", HttpStatus.BAD_REQUEST);
      }


      const cohortTenantMap = await this.cohortRepository.find({
        where: {
          cohortId: cohortId,
          tenantId: tenantId
        }
      })
      if (!cohortTenantMap) {
        return APIResponse.error(res, apiId, "Not Found", "Invalid input: Cohort not found for the provided tenant.", HttpStatus.NOT_FOUND);
      }
      const userDetails = await this.findcohortData(cohortId);
      if (userDetails === true) {
        let results = {
          userDetails: [],
        };

        let cohortDetails = await this.getUserDetails(
          cohortId,
          "cohortId",
          fieldvalues
        );
        results.userDetails.push(cohortDetails);

        return APIResponse.success(res, apiId, results, HttpStatus.OK, "Cohort members details fetched successfully.");
      } else {
        return APIResponse.error(res, apiId, "Not Found", "Invalid input: Cohort Member not exist.", HttpStatus.NOT_FOUND);
      }
    } catch (e) {
      const errorMessage = e.message || 'Internal server error';
      return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async getUserDetails(searchId: any, searchKey: any, fieldShowHide: any) {
    let results = {
      userDetails: [],
    };

    let getUserDetails = await this.findUserName(searchId, searchKey);

    for (let data of getUserDetails) {
      let userDetails = {
        userId: data?.userId,
        userName: data?.userName,
        name: data?.name,
        role: data?.role,
        district: data?.district,
        state: data?.state,
        mobile: data?.mobile
      };

      if (fieldShowHide === "true") {
        const fieldValues = await this.getFieldandFieldValues(data.userId);
        userDetails['customField'] = fieldValues;
        results.userDetails.push(userDetails);
      } else {
        results.userDetails.push(userDetails);
      }
    }

    return results;
  }


  async findFilledValues(userId: string) {
    let query = `SELECT U."userId",F."fieldId",F."value" FROM public."Users" U
    LEFT JOIN public."FieldValues" F
    ON U."userId" = F."itemId" where U."userId" =$1`;
    let result = await this.usersRepository.query(query, [userId]);
    return result;
  }


  async findcohortData(cohortId: any) {
    let whereClause: any = { cohortId: cohortId };
    let userDetails = await this.cohortMembersRepository.find({
      where: whereClause,
    });
    if (userDetails.length !== 0) {
      return true;
    } else {
      return false;
    }
  }


  async findCustomFields(role) {
    let customFields = await this.fieldsRepository.find({
      where: {
        context: "USERS",
        contextType: role.toUpperCase(),
      },
    });
    return customFields;
  }

  async getFieldandFieldValues(userId: string) {
    let query = `SELECT Fv."fieldId",F."label" AS FieldName,Fv."value" as FieldValues
    FROM public."FieldValues" Fv
    LEFT JOIN public."Fields" F
    ON F."fieldId" = Fv."fieldId"
    where Fv."itemId" =$1 `;
    let result = await this.usersRepository.query(query, [userId]);
    return result;
  }

  async findUserName(searchData: string, searchKey: any) {
    let whereCase;
    if (searchKey == "cohortId") {
      whereCase = `where CM."cohortId" =$1`;
    } else {
      whereCase = `where CM."userId" =$1`;
    }
    let query = `SELECT U."userId", U.username, U.name, U.district, U.state,U.mobile FROM public."CohortMembers" CM
    LEFT JOIN public."Users" U
    ON CM."userId" = U."userId" ${whereCase}`;

    let result = await this.usersRepository.query(query, [searchData]);
    return result;
  }

  public async searchCohortMembers(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    res: Response
  ) {
    const apiId = APIID.COHORT_MEMBER_SEARCH;
    try {
      if (!isUUID(tenantId)) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: TenantId must be a valid UUID.", HttpStatus.BAD_REQUEST);
      }

      let { limit, sort, offset, filters } = cohortMembersSearchDto;

      offset = offset ? offset : 0;
      limit = limit ? limit : 0;

      const whereClause = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause[key] = value;
        });
      }

      // Validate cohortId and userId format
      if (whereClause["cohortId"] && !isUUID(whereClause["cohortId"])) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: CohortId must be a valid UUID.", HttpStatus.BAD_REQUEST);
      }
      if (whereClause["userId"] && !isUUID(whereClause["userId"])) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: UserId must be a valid UUID.", HttpStatus.BAD_REQUEST);
      }
      // Check if cohortId exists
      if (whereClause["cohortId"]) {
        const cohortExists = await this.cohortMembersRepository.findOne({
          where: { cohortId: whereClause["cohortId"] },
        });
        if (!cohortExists) {
          return APIResponse.error(res, apiId, "Not Found", "Invalid input: No member found for this cohortId.", HttpStatus.NOT_FOUND);
        }
      }

      // Check if userId exists
      if (whereClause["userId"]) {
        const userExists = await this.cohortMembersRepository.findOne({
          where: { userId: whereClause["userId"] },
        });
        if (!userExists) {
          return APIResponse.error(res, apiId, "Not Found", "Invalid input: No member found for this userId and cohort combination.", HttpStatus.NOT_FOUND);
        }
      }

      let results = {};
      let where = [];
      if (whereClause["cohortId"]) {
        where.push(["cohortId", whereClause["cohortId"]]);
      }
      if (whereClause["userId"]) {
        where.push(["userId", whereClause["userId"]]);
      }
      if (whereClause["role"]) {
        where.push(["role", whereClause["role"]]);
      }
      if (whereClause["name"]) {
        where.push(["name", whereClause["name"]]);
      }

      if (whereClause["status"] && Array.isArray(whereClause["status"])) {
        where.push(["status", whereClause["status"]]);
      }
      let options = [];
      if (limit) {
        options.push(['limit', limit]);
      }
      if (offset) {
        options.push(['offset', offset]);
      }

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

      if (results['userDetails'].length == 0) {
        return APIResponse.error(res, apiId, "Not Found", "Invalid input: No data found.", HttpStatus.NOT_FOUND);
      }

      return APIResponse.success(res, apiId, results, HttpStatus.OK, "Cohort members details fetched successfully.");

    } catch (e) {
      const errorMessage = e.message || 'Internal server error';
      return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getCohortMemberUserDetails(where: any, fieldShowHide: any, options: any, order: any) {
    let results = {
      totalCount: 0,
      userDetails: []
    };
    let getUserDetails = await this.getUsers(where, options, order);

    if (getUserDetails.length > 0) {
      results.totalCount = parseInt(getUserDetails[0].total_count, 10);
      for (let data of getUserDetails) {
        if (fieldShowHide === "false") {
          results.userDetails.push(data);
        } else {
          const fieldValues = await this.getFieldandFieldValues(data.userId);
          data['customField'] = fieldValues;
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
    deviceId: string
  ) {
    const apiId = APIID.COHORT_MEMBER_CREATE;
    try {
      cohortMembers.createdBy = loginUser;
      cohortMembers.updatedBy = loginUser;
      const existCohort = await this.cohortRepository.find({
        where: {
          cohortId: cohortMembers.cohortId
        }
      })
      if (existCohort.length == 0) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: Cohort Id does not exist.", HttpStatus.BAD_REQUEST);
      }

      const existUser = await this.usersRepository.find({
        where: {
          userId: cohortMembers.userId,
        }
      })
      if (existUser.length == 0) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: User Id does not exist.", HttpStatus.BAD_REQUEST);
      }

      const existrole = await this.cohortMembersRepository.find({
        where: {
          userId: cohortMembers.userId,
          cohortId: cohortMembers.cohortId
        }
      })
      if (existrole.length > 0) {
        return APIResponse.error(res, apiId, "CONFLICT", `User '${cohortMembers.userId}' is already assigned to cohort '${cohortMembers.cohortId}'.`, HttpStatus.CONFLICT);
      }

      // Create a new CohortMembers entity and populate it with cohortMembers data
      const savedCohortMember = await this.cohortMembersRepository.save(
        cohortMembers
      );

      if (deviceId) {
        // Prepare the notification payload
        const notificationPayload = {
          isQueue: false,
          context: 'COHORT',
          replacements: [cohortMembers.cohortId],
          push: {
            receipients: [deviceId],
            // to: deviceId,
          },
        };
        await this.notificationRequest.sendNotification(notificationPayload);
      }
      return APIResponse.success(res, apiId, savedCohortMember, HttpStatus.OK, "Cohort member has been successfully assigned.");

    } catch (e) {
      const errorMessage = e.message || 'Internal server error';
      return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getUsers(where: any, options: any, order: any) {
    let query = ``;
    let whereCase = ``;
    let limit, offset;

    if (where.length > 0) {
      whereCase = `WHERE `;
      where.forEach((value, index) => {
        if (value[0] === "role") {
          whereCase += `R."name"='${value[1]}'`;
        }
        else {
          if (value[0] === "status") {
            const statusValues = value[1].map(status => `'${status}'`).join(', ');
            whereCase += `CM."status" IN (${statusValues})`;
          } else if (value[0] === "name") {
            whereCase += `U."name" ILIKE '%${value[1]}%'`;
          } else {
            whereCase += `CM."${value[0]}"='${value[1]}'`;
          }
        }
        if (index !== where.length - 1) {
          whereCase += ` AND `;
        }
      });
    }

    query = `SELECT U."userId", U."username", U."name", R."name" AS role, U."district", U."state",U."mobile", U."createdAt",U."updatedAt", 
      CM."status", CM."statusReason",CM."cohortMembershipId", COUNT(*) OVER() AS total_count  FROM public."CohortMembers" CM
      INNER JOIN public."Users" U
      ON CM."userId" = U."userId"
      INNER JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      INNER JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCase}`;

    options.forEach(option => {
      if (option[0] === 'limit') {
        limit = option[1];
      }
      if (option[0] === 'offset') {
        offset = option[1];
      }
    });

    if (order && Object.keys(order).length > 0) {
      const orderField = Object.keys(order)[0];
      const orderDirection = order[orderField].toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${orderField} ${orderDirection}`;
    }

    if (limit !== undefined) {
      query += ` LIMIT ${limit}`;
    }

    if (offset !== undefined) {
      query += ` OFFSET ${offset}`;
    }

    let result = await this.usersRepository.query(query);

    return result;
  }

  public async updateCohortMembers(
    cohortMembershipId: string,
    loginUser: any,
    cohortMembersUpdateDto: CohortMembersUpdateDto,
    res: Response,
  ) {
    const apiId = APIID.COHORT_MEMBER_UPDATE;

    try {
      cohortMembersUpdateDto.updatedBy = loginUser;
      if (!isUUID(cohortMembershipId)) {
        return APIResponse.error(res, apiId, "Bad Request", "Invalid input: Please Enter a valid UUID for cohortMembershipId.", HttpStatus.BAD_REQUEST);
      }

      const cohortMembershipToUpdate = await this.cohortMembersRepository.findOne({
        where: { cohortMembershipId: cohortMembershipId },
      });

      if (!cohortMembershipToUpdate) {
        return APIResponse.error(res, apiId, "Not Found", "Invalid input: Cohort member not found.", HttpStatus.NOT_FOUND);
      }

      Object.assign(cohortMembershipToUpdate, cohortMembersUpdateDto);

      const updatedCohortMember = await this.cohortMembersRepository.save(
        cohortMembershipToUpdate
      );

      return APIResponse.success(res, apiId, updatedCohortMember, HttpStatus.OK, "Cohort Member Updated successfully.");

    } catch (e) {
      const errorMessage = e.message || 'Internal server error';
      return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
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
        return APIResponse.error(res, apiId, "Not Found", "Invalid input: Cohort member not found.", HttpStatus.NOT_FOUND);
      }

      const result = await this.cohortMembersRepository.delete(
        cohortMembershipId
      );

      return APIResponse.success(res, apiId, result, HttpStatus.OK, "Cohort Member deleted Successfully.");
    } catch (e) {
      const errorMessage = e.message || 'Internal server error';
      return APIResponse.error(res, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  public async checkUserExist(userId) {
    const existUser = await this.usersRepository.findOne({
      where: {
        userId: userId,
      }
    })
    if (!existUser) {
      return false;
    }
    return existUser;
  }

  public async checkCohortExist(cohortId) {

    const existCohort = await this.cohortRepository.findOne({
      where: {
        cohortId: cohortId
      }
    })
    if (!existCohort) {
      return false;
    }
    return existCohort;
  }

  public async cohortUserMapping(userId, cohortId) {
    const mappingExist = await this.cohortMembersRepository.findOne({
      where: {
        userId: userId,
        cohortId: cohortId,
      }
    })
    if (!mappingExist) {
      return false;
    }
    return mappingExist;
  }

  public async createBulkCohortMembers(
    loginUser: any,
    cohortMembersDto: { userId: string[], cohortId: string[], removeCohortId?: string[] },
    response: Response,
    tenantId: string
  ) {
    const results = [];
    const errors = [];
    const cohortMembersBase = {
      createdBy: loginUser,
      updatedBy: loginUser,
      tenantId: tenantId
    };

    for (let userId of cohortMembersDto.userId) {
      const userExists = await this.checkUserExist(userId);
      if (!userExists) {
        errors.push(`User with userId ${userId} does not exist.`);
        continue;
      }

      // Handling of Removing Cohort from user
      if (cohortMembersDto.removeCohortId && cohortMembersDto.removeCohortId.length > 0) {
        for (let removeCohortId of cohortMembersDto.removeCohortId) {
          try {
            const cohortExists = await this.checkCohortExist(removeCohortId);
            if (!cohortExists) {
              errors.push(`Cohort with cohortId ${removeCohortId} does not exist.`);
              continue;
            }
            const updateCohort = await this.cohortMembersRepository.update({ userId, cohortId: removeCohortId }, { status: MemberStatus.ARCHIVED });
            if (updateCohort.affected === 0) {
              results.push({ message: `Cohort Id ${removeCohortId} is not mapped to user Id${userId}} ` });
            } else {
              results.push({ message: `Cohort Id ${removeCohortId} status updated for This user Id${userId}} ` });
            }
          } catch (error) {
            errors.push(`Error updating cohort member with userId ${userId} and cohortId ${removeCohortId}: ${error.message}`);
          }
        }
      }

      // Handling of Addition of User in Cohort
      for (let cohortId of cohortMembersDto.cohortId) {
        const cohortMembers = {
          ...cohortMembersBase,
          userId: userId,
          cohortId: cohortId
        };
        try {
          const cohortExists = await this.checkCohortExist(cohortId);
          if (!cohortExists) {
            errors.push(`Cohort with cohortId ${cohortId} does not exist.`);
            continue;
          }
          const mappingExists = await this.cohortUserMapping(userId, cohortId);
          if (mappingExists) {
            if (mappingExists.status === MemberStatus.ACTIVE) {
              errors.push(`Mapping already exists for userId ${userId} and cohortId ${cohortId}.`);
              continue;
            } else if (mappingExists.status === MemberStatus.ARCHIVED) {
              const updateCohort = await this.cohortMembersRepository.update({ userId, cohortId }, { status: MemberStatus.ACTIVE });
              results.push(updateCohort);
              continue;
            }
          }
          const result = await this.cohortMembersRepository.save(cohortMembers);
          results.push(result);
        } catch (error) {
          errors.push(`Error saving cohort member with userId ${userId} and cohortId ${cohortId}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      return APIResponse.success(response, APIID.COHORT_MEMBER_CREATE, { results, errors }, HttpStatus.CREATED, "Cohort Members Created with some errors");
    }

    return APIResponse.success(response, APIID.COHORT_MEMBER_CREATE, results, HttpStatus.CREATED, "Cohort Members Created Successfully");
  }
}
