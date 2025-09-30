import { Injectable } from '@nestjs/common';
import { CohortMembersDto } from 'src/cohortMembers/dto/cohortMembers.dto';
import { CohortMembersSearchDto } from 'src/cohortMembers/dto/cohortMembers-search.dto';
import {
  CohortMembers,
  MemberStatus,
} from 'src/cohortMembers/entities/cohort-member.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PostgresFieldsService } from './fields-adapter';
import { HttpStatus } from '@nestjs/common';
import { User } from 'src/user/entities/user-entity';
import { CohortMembersUpdateDto } from 'src/cohortMembers/dto/cohortMember-update.dto';
import { Fields } from 'src/fields/entities/fields.entity';
import { FieldValues } from 'src/fields/entities/fields-values.entity';
import { isUUID } from 'class-validator';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import APIResponse from 'src/common/responses/response';
import { response, Response } from 'express';
import { APIID } from 'src/common/utils/api-id.config';
import { NotificationRequest } from '@utils/notification.axios';
import { CohortAcademicYear } from 'src/cohortAcademicYear/entities/cohortAcademicYear.entity';
import { PostgresAcademicYearService } from './academicyears-adapter';
import { API_RESPONSES } from '@utils/response.messages';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { ShortlistingLogger } from 'src/common/logger/ShortlistingLogger';
import { PostgresUserService } from './user-adapter';
import { isValid } from 'date-fns';
import { FieldValuesOptionDto } from 'src/user/dto/user-create.dto';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';
import { FormSubmissionService } from 'src/forms/services/form-submission.service';
import { FormSubmissionStatus } from 'src/forms/entities/form-submission.entity';
import { FormSubmissionSearchDto } from 'src/forms/dto/form-submission-search.dto';
import { FormsService } from 'src/forms/forms.service';
import { isElasticsearchEnabled } from 'src/common/utils/elasticsearch.util';
import { UserElasticsearchService } from 'src/elasticsearch/user-elasticsearch.service';
import axios from 'axios';
@Injectable()
export class PostgresCohortMembersService {
  constructor(
    @InjectRepository(CohortMembers)
    private cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Cohort)
    private cohortRepository: Repository<Cohort>,
    @InjectRepository(CohortAcademicYear)
    private readonly cohortAcademicYearRespository: Repository<CohortAcademicYear>,
    private readonly academicyearService: PostgresAcademicYearService,
    private readonly notificationRequest: NotificationRequest,
    private fieldsService: PostgresFieldsService,
    private readonly userService: PostgresUserService,
    private readonly formsService: FormsService,
    private readonly formSubmissionService: FormSubmissionService,
    private readonly userElasticsearchService: UserElasticsearchService
  ) {}

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
          'cohortId',
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
      );
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

      if (fieldShowHide === 'true') {
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
        context: 'USERS',
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
    if (searchKey == 'cohortId') {
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
      const {
        sort,
        filters,
        includeDisplayValues = false,
      } = cohortMembersSearchDto;
      offset = offset || 0;
      limit = limit || 0;
      let results = {};
      let where: any[] = [];
      const options = [];

      const whereClause = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (key === 'cohortId') {
            if (Array.isArray(value)) {
              whereClause[key] = value;
            } else if (typeof value === 'string') {
              whereClause[key] = value.split(',').map((id) => id.trim()); // Convert to array
            } else {
              return APIResponse.error(
                res,
                apiId,
                API_RESPONSES.BAD_REQUEST,
                `Invalid cohortId format. Expected an array of UUIDs.`,
                HttpStatus.BAD_REQUEST
              );
            }
          } else {
            whereClause[key] = value;
          }
        });
      }

      let cohortYearExistInYear = [],
        userYearExistInYear = [],
        finalExistRecord = [];
      // Check if cohortId exists for passing year
      if (whereClause['cohortId']) {
        const getYearExistRecord = await this.isCohortExistForYear(
          academicyearId,
          whereClause['cohortId']
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
      if (whereClause['userId']) {
        const getYearExitUser = await this.isUserExistForYear(
          academicyearId,
          // cohortMembersSearchDto.filters.userId
          whereClause['userId']
        );
        if (getYearExitUser.length === 0) {
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.USER_NOTFOUND,
            API_RESPONSES.NOT_FOUND,
            HttpStatus.OK
          );
        }
        userYearExistInYear = getYearExitUser.map(
          (item) => item.cohortAcademicYearId
        );
        finalExistRecord = [...userYearExistInYear];
      }

      // Validate if both cohortId and userId match in the same academic year
      if (
        whereClause['userId'] &&
        whereClause['cohortId'] &&
        !cohortYearExistInYear.some((cayId) =>
          userYearExistInYear.includes(cayId)
        )
      ) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.COHORT_USER_NOTFOUND,
          API_RESPONSES.NOT_FOUND,
          HttpStatus.OK
        );
      }
      // Add cohortAcademicYearId filter if applicable
      if (finalExistRecord.length > 0) {
        whereClause['cohortAcademicYearId'] = finalExistRecord;
      }
      const whereKeys = [
        'cohortId',
        'userId',
        'role',
        'name',
        'status',
        'cohortAcademicYearId',
        'firstName',
        'lastName',
        'email',
        'country',
        'auto_tags',
      ];
      whereKeys.forEach((key) => {
        if (whereClause[key]) {
          where.push([key, whereClause[key]]);
        }
      });

      if (limit) options.push(['limit', limit]);
      if (offset) options.push(['offset', offset]);

      const order = {};
      if (sort) {
        const [sortField, sortOrder] = sort;
        order[sortField] = sortOrder;
      }
      const uniqueWhere = new Map(); // Store unique conditions
      whereKeys.forEach((key) => {
        if (whereClause[key]) {
          const value = Array.isArray(whereClause[key])
            ? whereClause[key] //Ensure it's an array
            : [whereClause[key]]; // Wrap single value in an array

          if (!uniqueWhere.has(key)) {
            uniqueWhere.set(key, value);
          }
        }
      });
      // Convert Map to an array for `where`
      where = Array.from(uniqueWhere.entries());

      results = await this.getCohortMemberUserDetails(
        where,
        'true',
        options,
        order,
        cohortMembersSearchDto.filters?.searchtext
      );
      if (results['userDetails'].length == 0) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USER_DETAIL_NOTFOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // NEW: Add cohort details to each user
      if (results['userDetails'] && results['userDetails'].length > 0) {
        // Get unique cohort IDs from the results
        const cohortIds = [
          ...new Set(results['userDetails'].map((user) => user.cohortId)),
        ].filter((id) => id) as string[];

        // Fetch cohort details for all unique cohort IDs
        const cohortDetailsMap = new Map<string, any>();

        for (const cohortId of cohortIds) {
          try {
            // Get basic cohort information
            const cohort = await this.cohortRepository.findOne({
              where: { cohortId: cohortId },
              select: ['cohortId', 'name', 'parentId', 'type', 'status'],
            });

            if (cohort) {
              // Get cohort custom fields using local method
              const cohortCustomFields = await this.getCohortCustomFieldDetails(
                cohortId
              );

              cohortDetailsMap.set(cohortId, {
                cohortId: cohort.cohortId,
                name: cohort.name,
                parentId: cohort.parentId,
                type: cohort.type,
                status: cohort.status,
                customFields: cohortCustomFields,
              });
            }
          } catch (error) {
            LoggerUtil.error(
              `Failed to fetch cohort details for cohortId: ${cohortId}`,
              `Error: ${error.message}`,
              apiId
            );
            // Continue with other cohorts even if one fails
          }
        }

        // Add cohort details to each user
        results['userDetails'] = results['userDetails'].map((user) => ({
          ...user,
          cohort: cohortDetailsMap.get(user.cohortId) || null,
        }));
      }

      // Check if CSV export is requested
      if (includeDisplayValues == true) {
        // Extract unique createdBy and updatedBy user IDs
        const userIds: string[] = Array.from(
          new Set(
            results['userDetails']
              .map((user) => [user.createdBy, user.updatedBy])
              .flat()
              .filter((id) => typeof id === 'string')
          )
        ) as string[];

        if (userIds.length > 0) {
          try {
            // Fetch user details based on IDs
            const userDetails = await this.getUserNamesByIds(userIds);

            if (userDetails && Object.keys(userDetails).length > 0) {
              // Update userDetails with createdByName and updatedByName
              results['userDetails'] = results['userDetails'].map((user) => ({
                ...user,
                createdByName: user.createdBy
                  ? userDetails[user.createdBy] || null
                  : null,
                updatedByName: user.updatedBy
                  ? userDetails[user.updatedBy] || null
                  : null,
              }));
            }
          } catch (error) {
            LoggerUtil.error(
              `${API_RESPONSES.SERVER_ERROR}`,
              `Error fetching user names: ${error.message}`,
              apiId
            );
          }
        }
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
      );
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

  async isCohortExistForYear(yearId, cohortId) {
    return await this.cohortAcademicYearRespository.find({
      where: {
        academicYearId: yearId,
        cohortId: Array.isArray(cohortId) ? In(cohortId) : cohortId,
      },
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
    order: any,
    searchtext?: string
  ) {
    const results = {
      totalCount: 0,
      userDetails: [],
    };
    const getUserDetails = await this.getUsers(
      where,
      options,
      order,
      searchtext
    );

    if (getUserDetails.length > 0) {
      results.totalCount = parseInt(getUserDetails[0].total_count, 10);
      for (const data of getUserDetails) {
        if (fieldShowHide === 'false') {
          results.userDetails.push(data);
        } else {
          const fieldValues =
            await this.fieldsService.getUserCustomFieldDetails(data.userId);
          //get data by cohort membership Id
          let fieldValuesForCohort =
            await this.fieldsService.getFieldsAndFieldsValues(
              data.cohortMembershipId
            );

          fieldValuesForCohort = fieldValuesForCohort.map((field) => {
            return {
              fieldId: field.fieldId,
              label: field.label,
              value: field.value,
              type: field.type,
              code: field.code,
            };
          });

          data['customField'] = fieldValues.concat(fieldValuesForCohort);
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

      // Update Elasticsearch with cohort member status
      if (isElasticsearchEnabled()) {
        try {
          // First get the existing user document from Elasticsearch
          const userDoc = await this.userElasticsearchService.getUser(
            cohortMembers.userId
          );
          // Extract the application array if present
          const source =
            userDoc && userDoc._source
              ? (userDoc._source as { applications?: any[] })
              : undefined;
          let applications = Array.isArray(source?.applications)
            ? [...source.applications]
            : [];

          const appIndex = applications.findIndex(
            (app) => app.cohortId === cohortMembers.cohortId
          );

          if (appIndex !== -1) {
            // Update the existing application object for this cohortId
            applications[appIndex] = {
              ...applications[appIndex],
              cohortId: cohortMembers.cohortId,
              cohortmemberstatus: savedCohortMember.status ?? 'active',
              // Optionally merge other fields here if needed
            };
          } else {
            // Add a new application object for this cohortId
            applications.push({
              cohortId: cohortMembers.cohortId,
              cohortmemberstatus: savedCohortMember.status ?? 'active',
              // Add other default fields as needed
            });
          }

          // Now update the user document in Elasticsearch with the merged applications array
          const baseDoc =
            typeof userDoc?._source === 'object' ? userDoc._source : {};
          await this.userElasticsearchService.updateUser(
            cohortMembers.userId,
            { doc: { ...baseDoc, applications } },
            async (userId: string) => {
              return await this.formSubmissionService.buildUserDocumentForElasticsearch(
                userId
              );
            }
          );
        } catch (elasticError) {
          // Log Elasticsearch error but don't fail the request
          LoggerUtil.error(
            'Failed to update Elasticsearch with cohort member status',
            `Error: ${elasticError.message}`,
            apiId
          );
        }
      }
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
      );
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

  async getUsers(where: any, options: any, order: any, searchtext?: string) {
    let whereCase = ``;
    let limit, offset;

    if (where.length > 0) {
      whereCase = 'WHERE ';

      const processCondition = ([key, value]) => {
        switch (key) {
          case 'role':
            return `R."name"='${value}'`;
          case 'status': {
            const statusValues = Array.isArray(value)
              ? value.map((status) => `'${status}'`).join(', ')
              : `'${value}'`;
            return `CM."status" IN (${statusValues})`;
          }
          case 'firstName': {
            return `U."firstName" ILIKE '%${value}%'`;
          }
          case 'email': {
            return `U."email" ILIKE '%${value}%'`;
          }
          case 'country': {
            const countryValues = Array.isArray(value)
              ? value.map((country) => `'${country}'`).join(', ')
              : `'${value}'`;
            return `U."country" IN (${countryValues})`;
          }
          case 'cohortAcademicYearId': {
            const cohortIdAcademicYear = Array.isArray(value)
              ? value.map((id) => `'${id}'`).join(', ')
              : `'${value}'`;
            return `CM."cohortAcademicYearId" IN (${cohortIdAcademicYear})`;
          }
          case 'cohortId': {
            //Handles UUID array properly
            const formattedIds = Array.isArray(value)
              ? value.map((id) => `'${id}'`).join(', ')
              : `'${value}'`;
            return `CM."${key}" IN (${formattedIds})`;
          }
          case 'auto_tags': {
            // Handle auto_tags with PostgreSQL array overlap operator
            const escaped = value
              .map((tag) => `'${tag.trim().replace(/'/g, "''")}'`)
              .join(', ');
            return `(U."auto_tags" && ARRAY[${escaped}]::text[])`;
          }
          default: {
            return `CM."${key}"='${value}'`;
          }
        }
      };
      whereCase += where.map(processCondition).join(' AND ');
    }

    // Add searchtext filter if provided
    if (searchtext && searchtext.trim().length >= 2) {
      try {
        const searchWhereClause = this.buildSearchTextWhereClause(searchtext);
        if (searchWhereClause) {
          const searchCondition = searchWhereClause.replace(/^AND\s+/, '');
          if (whereCase === 'WHERE ') {
            whereCase += searchCondition;
          } else {
            whereCase += ` AND ${searchCondition}`;
          }
        }
      } catch (error) {
        console.error('Error building search text where clause:', error);
        // Continue without search filter if there's an error
      }
    }

    let query = `SELECT U."userId", U."username",U."email", U."firstName", U."middleName", U."lastName", R."name" AS role, U."district", U."state",U."mobile",U."deviceId",U."gender",U."dob",U."country",U."auto_tags",
      CM."status", CM."statusReason",CM."cohortMembershipId",CM."cohortId",CM."status",CM."createdAt", CM."updatedAt",U."createdBy",U."updatedBy", COUNT(*) OVER() AS total_count  FROM public."CohortMembers" CM
      INNER JOIN public."Users" U
      ON CM."userId" = U."userId"
      INNER JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      INNER JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCase}`;

    options.forEach((option) => {
      if (option[0] === 'limit') {
        limit = option[1];
      }
      if (option[0] === 'offset') {
        offset = option[1];
      }
    });

    if (order && Object.keys(order).length > 0) {
      const orderField = Object.keys(order)[0];
      const orderDirection =
        order[orderField].toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
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

  // Generic helper method to build base query with common logic
  private buildBaseQuery(
    where: any,
    options: any,
    order: any,
    additionalJoins: string = '',
    additionalWhereConditions: string = ''
  ): { query: string; parameters: any[]; limit: number; offset: number } {
    let whereCase = ``;
    let limit, offset;
    let parameters: any[] = [];
    let parameterIndex = 1;

    if (where.length > 0) {
      whereCase = 'WHERE ';

      const processCondition = ([key, value]) => {
        switch (key) {
          case 'role':
            parameters.push(value);
            return `R."name"=$${parameterIndex++}`;
          case 'status': {
            const statusValues = Array.isArray(value)
              ? value.map((status) => `'${status}'`).join(', ')
              : `'${value}'`;
            return `CM."status" IN (${statusValues})`;
          }
          case 'firstName': {
            parameters.push(`%${value}%`);
            return `U."firstName" ILIKE $${parameterIndex++}`;
          }
          case 'email': {
            parameters.push(`%${value}%`);
            return `U."email" ILIKE $${parameterIndex++}`;
          }
          case 'country': {
            const countryValues = Array.isArray(value)
              ? value.map((country) => `'${country}'`).join(', ')
              : `'${value}'`;
            return `U."country" IN (${countryValues})`;
          }
          case 'cohortAcademicYearId': {
            const cohortIdAcademicYear = Array.isArray(value)
              ? value.map((id) => `'${id}'`).join(', ')
              : `'${value}'`;
            return `CM."cohortAcademicYearId" IN (${cohortIdAcademicYear})`;
          }
          case 'cohortId': {
            //Handles UUID array properly
            const formattedIds = Array.isArray(value)
              ? value.map((id) => `'${id}'`).join(', ')
              : `'${value}'`;
            return `CM."${key}" IN (${formattedIds})`;
          }
          case 'auto_tags': {
            // Handle auto_tags with PostgreSQL array overlap operator
            const escaped = value
              .map((tag) => `'${tag.trim().replace(/'/g, "''")}'`)
              .join(', ');
            return `(U."auto_tags" && ARRAY[${escaped}]::text[])`;
          }
          default: {
            parameters.push(value);
            return `CM."${key}"=$${parameterIndex++}`;
          }
        }
      };
      whereCase += where.map(processCondition).join(' AND ');
    }

    // Add additional where conditions if provided
    if (additionalWhereConditions) {
      if (whereCase) {
        whereCase += ` AND ${additionalWhereConditions}`;
      } else {
        whereCase = `WHERE ${additionalWhereConditions}`;
      }
    }

    let query = `SELECT U."userId", U."username",U."email", U."firstName", U."middleName", U."lastName", R."name" AS role, U."district", U."state",U."mobile",U."deviceId",U."gender",U."dob",U."country",U."auto_tags",
      CM."status", CM."statusReason",CM."cohortMembershipId",CM."cohortId",CM."status",CM."createdAt", CM."updatedAt",U."createdBy",U."updatedBy", COUNT(*) OVER() AS total_count  
      FROM public."CohortMembers" CM
      INNER JOIN public."Users" U
      ON CM."userId" = U."userId"
      INNER JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      INNER JOIN public."Roles" R
      ON R."roleId" = UR."roleId"${additionalJoins} ${whereCase}`;

    options.forEach((option) => {
      if (option[0] === 'limit') {
        limit = option[1];
      }
      if (option[0] === 'offset') {
        offset = option[1];
      }
    });

    if (order && Object.keys(order).length > 0) {
      const orderField = Object.keys(order)[0];
      const orderDirection =
        order[orderField].toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY U."${orderField}" ${orderDirection}`;
    }

    if (limit !== undefined) {
      query += ` LIMIT ${limit}`;
    }

    if (offset !== undefined) {
      query += ` OFFSET ${offset}`;
    }

    return { query, parameters, limit, offset };
  }

  // Helper method to build query with completion filter
  private buildQueryWithCompletionFilter(
    where: any,
    options: any,
    order: any,
    completionPercentageRanges: { min: number; max: number }[],
    formId: string
  ): { query: string; parameters: any[]; limit: number; offset: number } {
    // Build completion percentage filter conditions with proper casting
    const completionConditions = completionPercentageRanges
      .map(
        (range) =>
          `(CAST(FS."completionPercentage" AS DECIMAL(5,2)) >= ${range.min} AND CAST(FS."completionPercentage" AS DECIMAL(5,2)) <= ${range.max})`
      )
      .join(' OR ');

    // Add completion percentage filter to WHERE clause (removed status filter to match original behavior)
    const completionFilter = `(FS."formId" = '${formId}' AND (${completionConditions}))`;

    const additionalJoins = `
      INNER JOIN public."formSubmissions" FS
      ON FS."itemId" = U."userId"`;

    return this.buildBaseQuery(
      where,
      options,
      order,
      additionalJoins,
      completionFilter
    );
  }

  async getUsersWithCompletionFilter(
    where: any,
    options: any,
    order: any,
    completionPercentageRanges: { min: number; max: number }[],
    formId: string
  ) {
    const { query, parameters } = this.buildQueryWithCompletionFilter(
      where,
      options,
      order,
      completionPercentageRanges,
      formId
    );

    const result = await this.usersRepository.query(query, parameters);
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
          'Bad Request',
          'Invalid input: Please Enter a valid UUID for cohortMembershipId.',
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
            'COHORTMEMBER',
            'COHORTMEMBER'
          );
        if (!customFieldValidate || !isValid) {
          return APIResponse.error(
            response,
            apiId,
            'BAD_REQUEST',
            `${customFieldValidate}`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const cohortMembershipToUpdate =
        await this.cohortMembersRepository.findOne({
          where: { cohortMembershipId: cohortMembershipId },
        });

      if (!cohortMembershipToUpdate) {
        return APIResponse.error(
          res,
          apiId,
          'Not Found',
          'Invalid input: Cohort member not found.',
          HttpStatus.NOT_FOUND
        );
      }

      // Store the previous status before updating
      const previousStatus = cohortMembershipToUpdate.status;

      Object.assign(cohortMembershipToUpdate, cohortMembersUpdateDto);
      const result = await this.cohortMembersRepository.save(
        cohortMembershipToUpdate
      );

      // NEW: Handle LMS enrollment for shortlisted and rejected users
      if (cohortMembershipToUpdate.status === 'shortlisted') {
        // Enroll user to LMS courses when status is updated to shortlisted
        // This ensures users who are shortlisted have access to cohort-specific courses
        try {
          await this.enrollShortlistedUserToLMSCourses(
            cohortMembershipToUpdate.userId,
            cohortMembershipToUpdate.cohortId
          );
        } catch (error) {
          ShortlistingLogger.logShortlistingError(
            `Failed to enroll user ${cohortMembershipToUpdate.userId} to LMS courses for cohort ${cohortMembershipToUpdate.cohortId}`,
            error.message,
            'LMSEnrollment'
          );
        }
      }

      if (cohortMembershipToUpdate.status === 'rejected') {
        // De-enroll user from LMS courses when status is updated to rejected
        // This ensures users who are rejected lose access to cohort-specific courses
        try {
          await this.deenrollRejectedUserFromLMSCourses(
            cohortMembershipToUpdate.userId,
            cohortMembershipToUpdate.cohortId
          );
        } catch (error) {
          ShortlistingLogger.logShortlistingError(
            `Failed to de-enroll user ${cohortMembershipToUpdate.userId} from LMS courses for cohort ${cohortMembershipToUpdate.cohortId}`,
            error.message,
            'LMSDeenrollment'
          );
        }
      }

      // Update Elasticsearch with updated cohort member status
      if (isElasticsearchEnabled()) {
        try {
          // First get the existing user document from Elasticsearch
          const userDoc = await this.userElasticsearchService.getUser(
            cohortMembershipToUpdate.userId
          );

          // Extract the application array if present
          const source =
            userDoc && userDoc._source
              ? (userDoc._source as { applications?: any[] })
              : undefined;
          const existingApplication =
            source && Array.isArray(source.applications)
              ? source.applications.find(
                  (app) => app.cohortId === cohortMembershipToUpdate.cohortId
                )
              : undefined;

          if (!existingApplication) {
            // If application is missing, build and upsert the full user document (with progress pages)
            const fullUserDoc =
              await this.formSubmissionService.buildUserDocumentForElasticsearch(
                cohortMembershipToUpdate.userId
              );
            if (fullUserDoc) {
              await this.userElasticsearchService.updateUser(
                cohortMembershipToUpdate.userId,
                { doc: fullUserDoc },
                async (userId: string) => {
                  return await this.formSubmissionService.buildUserDocumentForElasticsearch(
                    userId
                  );
                }
              );
            }
          } else {
            // SOLUTION 3: Use field-specific update to preserve existing data
            // This prevents the deletion of application data (progress, formData, etc.)
            // by only updating specific fields instead of replacing the entire application object
            await this.updateElasticsearchWithFieldSpecificChanges(
              cohortMembershipToUpdate.userId,
              cohortMembershipToUpdate.cohortId,
              {
                cohortmemberstatus: result.status ?? 'active',
                statusReason: cohortMembersUpdateDto.statusReason,
                status: cohortMembersUpdateDto.status,
              },
              existingApplication
            );
          }
        } catch (elasticError) {
          // Log Elasticsearch error but don't fail the request
          LoggerUtil.error(
            'Failed to update Elasticsearch with cohort member status',
            `Error: ${elasticError.message}`,
            apiId
          );
        }
      }

      // Send notification if applicable for this status only
      let notifyStatuses: string[] = [];
      const { status, statusReason } = cohortMembersUpdateDto;

      // Send notification if applicable for this status only
      if (previousStatus === 'applied' && status === 'submitted') {
        notifyStatuses = ['submitted'];
      } else {
        notifyStatuses = ['dropout', 'shortlisted', 'rejected'];
      }

      if (notifyStatuses.includes(status)) {
        const [userData, cohortData] = await Promise.all([
          this.usersRepository.findOne({
            where: { userId: cohortMembershipToUpdate.userId },
          }),
          this.cohortRepository.findOne({
            where: { cohortId: cohortMembershipToUpdate.cohortId },
          }),
        ]);

        if (userData?.email) {
          const validStatusKeys = {
            dropout: 'onStudentDropout',
            shortlisted: 'onStudentShortlisted',
            rejected: 'onStudentRejected',
            submitted: 'onApplicationSubmission',
          };

          //This is notification payload required to send

          const notificationPayload = {
            isQueue: false,
            context: 'USER',
            key: validStatusKeys[status],
            replacements: {
              '{username}': `${userData.firstName ?? ''} ${
                userData.lastName ?? ''
              }`.trim(),
              '{firstName}': userData.firstName ?? '',
              '{lastName}': userData.lastName ?? '',
              '{programName}': cohortData?.name ?? 'the program',
              '{status}': status,
              '{statusReason}': statusReason ?? 'Not specified',
              '{currentYear}': new Date().getFullYear(),
            },
            email: {
              receipients: [userData.email],
            },
          };

          const mailSend = await this.notificationRequest.sendNotification(
            notificationPayload
          );

          if (mailSend?.result?.email?.errors?.length > 0) {
            // Log email failure
            ShortlistingLogger.logEmailFailure({
              dateTime: new Date().toISOString(),
              userId: userData.userId,
              email: userData.email,
              shortlistedStatus: status as 'shortlisted' | 'rejected',
              failureReason: mailSend.result.email.errors.join(', '),
              cohortId: cohortMembershipToUpdate.cohortId,
            });
          } else {
            // Log email success
            ShortlistingLogger.logEmailSuccess({
              dateTime: new Date().toISOString(),
              userId: userData.userId,
              email: userData.email,
              shortlistedStatus: status as 'shortlisted' | 'rejected',
              cohortId: cohortMembershipToUpdate.cohortId,
            });

            // Update rejection_email_sent to true if status is rejected and email was sent successfully
            if (status === 'rejected') {
              await this.cohortMembersRepository.update(
                { cohortMembershipId: cohortMembershipId },
                { rejectionEmailSent: true }
              );
            }
          }
        } else {
          // Log email failure for missing email
          ShortlistingLogger.logEmailFailure({
            dateTime: new Date().toISOString(),
            userId: cohortMembershipToUpdate.userId,
            email: 'No email found',
            shortlistedStatus: status as 'shortlisted' | 'rejected',
            failureReason: `No email found for user ${cohortMembershipToUpdate.userId}`,
            cohortId: cohortMembershipToUpdate.cohortId,
          });
        }
      }
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
            responseForCustomField.error || 'Internal server error';
          return APIResponse.error(
            res,
            apiId,
            'Internal Server Error',
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
      );

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
          'Not Found',
          'Invalid input: Cohort member not found.',
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
        'Cohort Member deleted Successfully.'
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
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

  /**
   * SOLUTION 3: Field-specific Elasticsearch update method
   *
   * PROBLEM: The previous updateApplication method was completely replacing the application object,
   * which caused deletion of all existing data like progress, formData, etc.
   *
   * SOLUTION: Use Elasticsearch Painless scripts to update only specific fields while preserving
   * all existing data that's not being updated.
   *
   * @param userId - User ID to update
   * @param cohortId - Cohort ID for the application
   * @param updateData - Object containing only the fields to update
   * @param existingApplication - Existing application data (for reference)
   */
  private async updateElasticsearchWithFieldSpecificChanges(
    userId: string,
    cohortId: string,
    updateData: any,
    existingApplication: any
  ): Promise<void> {
    try {
      // Create a Painless script that only updates specific fields that have changed
      // This prevents data loss by preserving all existing fields not being updated
      const script = {
        source: `
          // Initialize applications array if it doesn't exist
          if (ctx._source.applications == null) {
            ctx._source.applications = [];
          }
          
          boolean found = false;
          // Search for existing application with matching cohortId
          for (int i = 0; i < ctx._source.applications.length; i++) {
            if (ctx._source.applications[i].cohortId == params.cohortId) {
              // CRITICAL: Only update specific fields that are provided in updateData
              // This prevents deletion of existing data like progress, formData, etc.
              if (params.updateData.cohortmemberstatus != null) {
                ctx._source.applications[i].cohortmemberstatus = params.updateData.cohortmemberstatus;
              }
              if (params.updateData.statusReason != null) {
                ctx._source.applications[i].statusReason = params.updateData.statusReason;
              }

              if (params.updateData.completionPercentage != null) {
                ctx._source.applications[i].completionPercentage = params.updateData.completionPercentage;
              }
              if (params.updateData.updatedAt != null) {
                ctx._source.applications[i].updatedAt = params.updateData.updatedAt;
              }
              
              // KEY IMPROVEMENT: Preserve all existing fields that are not being updated
              // This ensures we don't lose any existing data like progress, formData, etc.
              // The previous method was replacing the entire application object, causing data loss
              
              found = true;
              break;
            }
          }
          
          if (!found) {
            // If application doesn't exist, create a new one with minimal data
            // This maintains backward compatibility for new applications
            Map newApplication = new HashMap();
            newApplication.cohortId = params.cohortId;
            newApplication.cohortmemberstatus = params.updateData.cohortmemberstatus;
            newApplication.statusReason = params.updateData.statusReason;
            newApplication.updatedAt = params.updateData.updatedAt;
            newApplication.createdAt = params.updateData.updatedAt;
            
            // Initialize empty structures to preserve existing pattern
            // This ensures new applications have the expected structure
            newApplication.progress = [:];
            newApplication.progress.pages = [:];
            newApplication.progress.overall = [:];
            newApplication.progress.overall.completed = 0;
            newApplication.progress.overall.total = 0;
            newApplication.formData = [:];
            
            ctx._source.applications.add(newApplication);
          }
          
          // Update the document's updatedAt timestamp to reflect the change
          ctx._source.updatedAt = params.updateData.updatedAt;
        `,
        lang: 'painless',
        params: {
          cohortId,
          updateData: {
            cohortmemberstatus: updateData.cohortmemberstatus,
            statusReason: updateData.statusReason,
            completionPercentage: updateData.completionPercentage,
            updatedAt: new Date().toISOString(),
          },
        },
      };

      // Check if user document exists by trying to get it
      // This is safer than using private methods and provides the same functionality
      const userDoc = await this.userElasticsearchService.getUser(userId);

      if (userDoc) {
        // Update existing document with field-specific changes using the script
        // This ensures only specific fields are updated while preserving existing data
        await this.userElasticsearchService.updateUser(
          userId,
          { script },
          async (userId: string) => {
            return await this.formSubmissionService.buildUserDocumentForElasticsearch(
              userId
            );
          }
        );
      } else {
        // If user document doesn't exist, create it with the new application
        // This maintains backward compatibility for new users
        const fullUserDoc =
          await this.formSubmissionService.buildUserDocumentForElasticsearch(
            userId
          );
        if (fullUserDoc) {
          await this.userElasticsearchService.updateUser(
            userId,
            { doc: fullUserDoc },
            async (userId: string) => {
              return await this.formSubmissionService.buildUserDocumentForElasticsearch(
                userId
              );
            }
          );
        }
      }
    } catch (error) {
      // Log the error but don't fail the entire request
      // This ensures that database updates succeed even if Elasticsearch fails
      LoggerUtil.error(
        'Failed to update Elasticsearch with field-specific changes',
        `Error: ${error.message}`,
        'COHORT_MEMBER_UPDATE'
      );
      throw error;
    }
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

  /**
   * Get cohort custom field details using the existing fields service
   * This avoids code duplication by leveraging the existing PostgresFieldsService
   */
  public async getCohortCustomFieldDetails(cohortId: string) {
    if (!cohortId || typeof cohortId !== 'string') {
      throw new Error('Invalid cohortId parameter');
    }
    // Use the existing fields service to get cohort custom field details
    return await this.fieldsService.getFieldValuesData(
      cohortId,
      'COHORT',
      'COHORT',
      null,
      true
    );
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

  public async findExistingCohortMember(userId, cohortId, cohortAcademicYearId) {
    const existingMember = await this.cohortMembersRepository.findOne({
      where: {
        userId: userId,
        cohortId: cohortId,
        cohortAcademicYearId: cohortAcademicYearId,
      },
    });

    return existingMember;
  }

  public async createBulkCohortMembers(
    loginUser: any,
    cohortMembersDto: {
      userId: string[];
      cohortId: string[];
      removeCohortId?: string[];
      status?: string; // Allow status for bulk import
      statusReason?: string; // Allow statusReason for bulk import
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
            );
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
      if (cohortMembersDto?.cohortId && cohortMembersDto?.cohortId.length > 0) {
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
            // Check if any mapping exists (regardless of status)
            const existingMember = await this.findExistingCohortMember(
              userId,
              cohortId,
              cohortExists[0].cohortAcademicYearId
            );

            let result;

            if (existingMember) {
              // Update existing cohort member
              const updateData = {
                status: cohortMembersDto.status
                  ? Object.values(MemberStatus).includes(
                      cohortMembersDto.status as MemberStatus
                    )
                    ? (cohortMembersDto.status as MemberStatus)
                    : MemberStatus.ACTIVE
                  : MemberStatus.ACTIVE,
                statusReason: cohortMembersDto.statusReason || existingMember.statusReason || '',
                updatedBy: loginUser,
                updatedAt: new Date(),
              };

              await this.cohortMembersRepository.update(
                {
                  userId,
                  cohortId,
                  cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
                },
                updateData
              );

              // Get the updated record
              result = await this.cohortMembersRepository.findOne({
                where: {
                  userId,
                  cohortId,
                  cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
                },
              });
            } else {
              // Create new cohort member
              const cohortMemberForAcademicYear = {
                ...cohortMembers,
                cohortAcademicYearId: cohortExists[0].cohortAcademicYearId,
                status: cohortMembersDto.status
                  ? Object.values(MemberStatus).includes(
                      cohortMembersDto.status as MemberStatus
                    )
                    ? (cohortMembersDto.status as MemberStatus)
                    : MemberStatus.ACTIVE
                  : MemberStatus.ACTIVE,
                statusReason: cohortMembersDto.statusReason || '',
              };
              
              result = await this.cohortMembersRepository.save(
                cohortMemberForAcademicYear
              );
            }

            // NEW: Handle LMS enrollment for shortlisted users
            if (result.status === 'shortlisted') {
              // Enroll user to LMS courses when status is shortlisted during bulk creation
              // This ensures users who are shortlisted have access to cohort-specific courses
              try {
                await this.enrollShortlistedUserToLMSCourses(
                  result.userId,
                  result.cohortId
                );
              } catch (error) {
                ShortlistingLogger.logShortlistingError(
                  `Failed to enroll user ${result.userId} to LMS courses for cohort ${result.cohortId}`,
                  error.message,
                  'LMSEnrollment'
                );
              }
            }

            results.push(result);
          } catch (error) {
            LoggerUtil.error(
              `${API_RESPONSES.SERVER_ERROR}`,
              `Error: ${error.message}`,
              apiId
            );
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

  // This method lists cohort members with their application forms
  public async listWithApplication(
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

      const { filters } = cohortMembersSearchDto;
      const cohortId = filters?.cohortId;
      const userId = filters?.userId;

      //get the cohort userDetails same as searchcohortmembers
      const results = await this.getCohortMembersData(
        cohortMembersSearchDto,
        tenantId,
        academicyearId
      );
      const initialUserDetails = results.userDetails || [];
      // FIXED: Store the original total count from database query
      const originalTotalCount = results.totalCount || 0;

      if (!initialUserDetails.length) {
        return APIResponse.success(
          res,
          apiId,
          [],
          HttpStatus.OK,
          'No cohort members found'
        );
      }

      // Step 2: Get the active form
      const contextId = Array.isArray(cohortId) ? cohortId[0] : cohortId;
      // Validate contextId (cohortId)
      if (!contextId || !isUUID(contextId)) {
        LoggerUtil.error(
          API_RESPONSES.BAD_REQUEST,
          `Invalid or missing cohortId for form contextId: ${contextId}`,
          apiId
        );
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'Invalid or missing cohortId for form contextId',
          HttpStatus.BAD_REQUEST
        );
      }
      //to get the active form for cohort
      const form = await this.formsService.getFormData({
        context: 'COHORTMEMBER',
        contextId,
        contextType: 'COHORTMEMBER',
        tenantId,
      });

      // Step 3: For each userId, fetch their submissions and enrich
      const enrichedResults = await Promise.all(
        initialUserDetails.map(async (user) => {
          let formInfo = null;
          if (form?.formid && form.status === 'active') {
            // Fetch form submission for this user - directly query to avoid TypeORM In() operator issues
            const submission = await this.formSubmissionService[
              'formSubmissionRepository'
            ].findOne({
              where: {
                formId: form.formid,
                itemId: user.userId,
                // status: FormSubmissionStatus.ACTIVE,
              },
              order: {
                createdAt: 'DESC',
              },
            });

            let formSubmissionId = null;
            let formSubmissionStatus = null;
            let formSubmissionCreatedAt = null;
            let formSubmissionUpdatedAt = null;
            let completionPercentage = null; // Default to 0 if not available

            if (submission) {
              formSubmissionId = submission.submissionId;
              formSubmissionStatus = submission.status;
              formSubmissionCreatedAt = submission.createdAt
                ? new Date(submission.createdAt).toISOString().slice(0, 10)
                : null; //take only date
              formSubmissionUpdatedAt = submission.updatedAt
                ? new Date(submission.updatedAt).toISOString().slice(0, 10)
                : null;
              completionPercentage = submission.completionPercentage ?? 0; // Default to 0 if not available
            }
            formInfo = {
              title: form.title, //form title
              formId: form.formid, //form id
              formStatus: form.status, //form status
              formSubmissionId, //form submission id
              formSubmissionStatus,
              formSubmissionCreatedAt,
              formSubmissionUpdatedAt,
              completionPercentage, // This is the field used for filtering
            };
          }
          return {
            ...user,
            form: formInfo,
          };
        })
      );

      // Validate and extract formSubmissionCompletionPercentage filter from filters
      let completionPercentageRanges: { min: number; max: number }[] = [];

      // Check for both field names - prioritize formSubmissionCompletionPercentage
      const completionPercentageFilter =
        cohortMembersSearchDto.filters?.completionPercentage;

      if (completionPercentageFilter?.length) {
        try {
          completionPercentageRanges = completionPercentageFilter.map(
            (range: string, index: number) => {
              // Check for empty or invalid input
              if (!range || typeof range !== 'string') {
                throw new Error(
                  `Range at index ${index} must be a non-empty string. Received: ${typeof range}`
                );
              }

              // Trim whitespace and check for empty string after trimming
              const trimmedRange = range.trim();
              if (!trimmedRange) {
                throw new Error(
                  `Range at index ${index} cannot be empty or contain only whitespace`
                );
              }

              // Check for proper format with exactly one hyphen
              const parts = trimmedRange.split('-');
              if (parts.length !== 2) {
                throw new Error(
                  `Range at index ${index}: "${range}" must contain exactly one hyphen in format "min-max" (e.g., "0-50", "25-75", "80-100")`
                );
              }

              // Validate and parse numeric values
              const [minStr, maxStr] = parts;
              const min = Number(minStr.trim());
              const max = Number(maxStr.trim());

              // Check for non-numeric values
              if (isNaN(min)) {
                throw new Error(
                  `Invalid minimum value at index ${index}: "${minStr}". Must be a valid number between 0 and 100`
                );
              }

              if (isNaN(max)) {
                throw new Error(
                  `Invalid maximum value at index ${index}: "${maxStr}". Must be a valid number between 0 and 100`
                );
              }

              // Validate range constraints
              if (min < 0) {
                throw new Error(
                  `Minimum value at index ${index}: ${min} must be greater than or equal to 0`
                );
              }

              if (max > 100) {
                throw new Error(
                  `Maximum value at index ${index}: ${max} must be less than or equal to 100`
                );
              }

              if (min > max) {
                throw new Error(
                  `Invalid range at index ${index}: ${min}-${max}. Minimum value (${min}) cannot be greater than maximum value (${max})`
                );
              }

              return { min, max };
            }
          );
        } catch (validationError) {
          LoggerUtil.error(
            `Completion percentage filter validation failed`,
            `Error: ${validationError.message}`,
            apiId
          );
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `Completion percentage filter validation failed: ${validationError.message}. Expected format: "min-max" where 0 <= min <= max <= 100 (e.g., "0-50", "25-75", "80-100")`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      // Use optimized database query if completion percentage filtering is needed
      let finalUserDetails = [];
      let totalCount = 0;

      if (completionPercentageRanges.length > 0 && form?.formid) {
        // Use optimized database query with JOIN to formSubmissions table
        const { limit, offset } = cohortMembersSearchDto;
        const { sort, filters } = cohortMembersSearchDto;

        let where: any[] = [];
        const whereClause = {};
        if (filters && Object.keys(filters).length > 0) {
          Object.entries(filters).forEach(([key, value]) => {
            if (key === 'cohortId') {
              if (Array.isArray(value)) {
                whereClause[key] = value;
              } else if (typeof value === 'string') {
                whereClause[key] = value.split(',').map((id) => id.trim());
              }
            } else {
              whereClause[key] = value;
            }
          });
        }

        // Build where conditions for optimized query
        const whereKeys = [
          'cohortId',
          'userId',
          'role',
          'name',
          'status',
          'cohortAcademicYearId',
          'firstName',
          'lastName',
          'email',
          'country',
          'auto_tags',
        ];
        const uniqueWhere = new Map();
        whereKeys.forEach((key) => {
          if (whereClause[key]) {
            const value = Array.isArray(whereClause[key])
              ? whereClause[key]
              : [whereClause[key]];
            if (!uniqueWhere.has(key)) {
              uniqueWhere.set(key, value);
            }
          }
        });
        where = Array.from(uniqueWhere.entries());

        const options = [];
        if (limit) options.push(['limit', limit]);
        if (offset) options.push(['offset', offset]);

        const order = {};
        if (sort) {
          const [sortField, sortOrder] = sort;
          order[sortField] = sortOrder;
        }

        // Use optimized query with completion percentage filtering
        const optimizedResults = await this.getUsersWithCompletionFilter(
          where,
          options,
          order,
          completionPercentageRanges,
          form.formid
        );

        if (optimizedResults.length > 0) {
          totalCount = parseInt(optimizedResults[0].total_count, 10);

          // Enrich the results with form data and custom fields
          finalUserDetails = await Promise.all(
            optimizedResults.map(async (user) => {
              let formInfo = {
                title: form.title,
                formId: form.formid,
                formStatus: form.status,
                formSubmissionId: null,
                formSubmissionStatus: null,
                formSubmissionCreatedAt: null,
                formSubmissionUpdatedAt: null,
                completionPercentage: null,
              };

              // Get form submission details for this user - directly query to avoid TypeORM In() operator issues
              const submission = await this.formSubmissionService[
                'formSubmissionRepository'
              ].findOne({
                where: {
                  formId: form.formid,
                  itemId: user.userId,
                  // status: FormSubmissionStatus.ACTIVE,
                },
                order: {
                  createdAt: 'DESC',
                },
              });

              if (submission) {
                formInfo.formSubmissionId = submission.submissionId;
                formInfo.formSubmissionStatus = submission.status;
                formInfo.formSubmissionCreatedAt = submission.createdAt
                  ? new Date(submission.createdAt).toISOString().slice(0, 10)
                  : null;
                formInfo.formSubmissionUpdatedAt = submission.updatedAt
                  ? new Date(submission.updatedAt).toISOString().slice(0, 10)
                  : null;
                formInfo.completionPercentage =
                  submission.completionPercentage ?? 0;
              }

              // Get custom fields
              const fieldValues =
                await this.fieldsService.getUserCustomFieldDetails(user.userId);
              let fieldValuesForCohort =
                await this.fieldsService.getFieldsAndFieldsValues(
                  user.cohortMembershipId
                );
              fieldValuesForCohort = fieldValuesForCohort.map((field) => ({
                fieldId: field.fieldId,
                label: field.label,
                value: field.value,
                type: field.type,
                code: field.code,
              }));

              return {
                ...user,
                customField: fieldValues.concat(fieldValuesForCohort),
                form: formInfo,
              };
            })
          );
        }
      } else {
        // Use existing flow for cases without completion percentage filtering
        finalUserDetails = enrichedResults;
        // FIXED: Use the original total count from database query instead of limited results length
        totalCount = originalTotalCount;
      }

      // Create the new response structure with totalCount inside result and userDetails array
      const resultWithTotalCount = {
        totalCount: totalCount,
        userDetails: finalUserDetails,
      };

      return APIResponse.success(
        res,
        apiId,
        resultWithTotalCount,
        HttpStatus.OK,
        API_RESPONSES.COHORT_GET_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        e.message ?? 'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Add this private method before listWithApplication
  private async getCohortMembersData(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    academicyearId: string
  ) {
    let { limit, offset } = cohortMembersSearchDto;
    const {
      sort,
      filters,
      includeDisplayValues = false,
    } = cohortMembersSearchDto;
    offset = offset || 0;
    limit = limit || 0;
    let results = { userDetails: [] };
    const options = [];
    let where: any[] = [];
    const whereClause = {};
    if (filters && Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'cohortId') {
          if (Array.isArray(value)) {
            whereClause[key] = value;
          } else if (typeof value === 'string') {
            whereClause[key] = value.split(',').map((id) => id.trim());
          }
        } else {
          whereClause[key] = value;
        }
      });
    }

    let cohortYearExistInYear = [],
      userYearExistInYear = [],
      finalExistRecord = [];
    if (whereClause['cohortId']) {
      const getYearExistRecord = await this.isCohortExistForYear(
        academicyearId,
        whereClause['cohortId']
      );
      cohortYearExistInYear = getYearExistRecord.map(
        (item) => item.cohortAcademicYearId
      );
      finalExistRecord = [...cohortYearExistInYear];
    }
    if (whereClause['userId']) {
      const getYearExitUser = await this.isUserExistForYear(
        academicyearId,
        whereClause['userId']
      );
      userYearExistInYear = getYearExitUser.map(
        (item) => item.cohortAcademicYearId
      );
      finalExistRecord = [...userYearExistInYear];
    }
    if (
      whereClause['userId'] &&
      whereClause['cohortId'] &&
      !cohortYearExistInYear.some((cayId) =>
        userYearExistInYear.includes(cayId)
      )
    ) {
      return { userDetails: [] };
    }
    if (finalExistRecord.length > 0) {
      whereClause['cohortAcademicYearId'] = finalExistRecord;
    }
    const whereKeys = [
      'cohortId',
      'userId',
      'role',
      'name',
      'status',
      'cohortAcademicYearId',
      'firstName',
      'lastName',
      'email',
      'country',
      'auto_tags',
    ];
    const uniqueWhere = new Map();
    whereKeys.forEach((key) => {
      if (whereClause[key]) {
        const value = Array.isArray(whereClause[key])
          ? whereClause[key]
          : [whereClause[key]];
        if (!uniqueWhere.has(key)) {
          uniqueWhere.set(key, value);
        }
      }
    });
    where = Array.from(uniqueWhere.entries());
    if (limit) options.push(['limit', limit]);
    if (offset) options.push(['offset', offset]);
    const order = {};
    if (sort) {
      const [sortField, sortOrder] = sort;
      order[sortField] = sortOrder;
    }

    results = await this.getCohortMemberUserDetails(
      where,
      'true',
      options,
      order,
      cohortMembersSearchDto.filters?.searchtext
    );
    if (includeDisplayValues == true && results['userDetails']?.length) {
      const userIds: string[] = Array.from(
        new Set(
          results['userDetails']
            .map((user) => [user.updatedBy, user.createdBy])
            .flat()
            .filter((id) => typeof id === 'string')
        )
      ) as string[];
      if (userIds.length > 0) {
        try {
          const userDetails = await this.getUserNamesByIds(userIds);
          if (userDetails && Object.keys(userDetails).length > 0) {
            // Get userDetails
            results['userDetails'] = results['userDetails'].map((user) => ({
              ...user,

              updatedByName: user.updatedBy
                ? userDetails[user.updatedBy] || null
                : null,
              createdByName: user.createdBy
                ? userDetails[user.createdBy] || null
                : null,
            }));
          }
        } catch (error) {
          LoggerUtil.error(
            `${API_RESPONSES.SERVER_ERROR}`,
            `Error: ${error.message}`,
            APIID.COHORT_MEMBER_SEARCH
          );
          // In case of error, just return the results as is
        }
      }
    }
    // FIXED: Return both totalCount and userDetails from getCohortMemberUserDetails
    return {
      totalCount: (results as any).totalCount || 0,
      userDetails: results.userDetails || [],
    };
  }

  /**
   * Main method for evaluating cohort member shortlisting status
   * Processes all active cohorts with shortlist dates matching today's date
   *
   * This method implements a high-performance, parallel processing system that can handle
   * 100,000+ records per cohort with optimized batching and concurrent processing.
   *
   * Process Flow:
   * 1. Fetch active cohorts with shortlist date = today
   * 2. For each cohort, fetch active forms and extract rules
   * 3. Get submitted cohort members for evaluation
   * 4. Process members in parallel batches for optimal performance
   * 5. Evaluate form rules against user field values
   * 6. Update member status to 'shortlisted' or 'rejected'
   * 7. Send email notifications based on results (if enabled)
   * 8. Log failures for manual review
   *
   * Performance Features:
   * - Configurable batch size (default: 1000 records per batch)
   * - Parallel processing with configurable concurrency (default: 5 batches)
   * - Optimized database queries with batch fetching
   * - Real-time performance monitoring and metrics
   * - Graceful error handling with detailed failure logging
   * - Optional email notifications for performance optimization
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @param res - Express response object for API response
   * @returns Promise with evaluation results and performance metrics
   */
  public async evaluateCohortMemberShortlistingStatus(
    tenantId: string,
    academicyearId: string,
    userId: string,
    res: Response
  ) {
    try {
      const result = await this.evaluateCohortMemberShortlistingStatusInternal(
        tenantId,
        academicyearId,
        userId
      );

      return APIResponse.success(
        res,
        APIID.COHORT_MEMBER_EVALUATE_SHORTLISTING,
        result,
        HttpStatus.OK,
        'Cohort member shortlisting evaluation completed successfully'
      );
    } catch (error) {
      return APIResponse.error(
        res,
        APIID.COHORT_MEMBER_EVALUATE_SHORTLISTING,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Internal method for evaluating cohort member shortlisting status
   * Returns data directly without requiring a Response object
   * Used by both API endpoints and cron jobs
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @returns Promise with evaluation results and performance metrics
   */
  public async evaluateCohortMemberShortlistingStatusInternal(
    tenantId: string,
    academicyearId: string,
    userId: string
  ) {
    const apiId = APIID.COHORT_MEMBER_EVALUATE_SHORTLISTING;
    // Configurable performance parameters with environment variable fallbacks
    const batchSize = parseInt(process.env.BATCH_SIZE) || 5000;
    const maxConcurrentBatches =
      parseInt(process.env.MAX_CONCURRENT_BATCHES) || 10;
    const enableEmailNotifications =
      process.env.ENABLE_SHORTLISTING_EMAILS === 'true';
    const notifyStatuses = ['shortlisted', 'rejected'];

    // Field ID for shortlist date - should be configured based on your field structure
    const shortlistDateFieldId = process.env.SHORTLIST_DATE_FIELD_ID;

    if (!shortlistDateFieldId) {
      throw new Error(
        'SHORTLIST_DATE_FIELD_ID environment variable is required for shortlisting evaluation'
      );
    }

    const startTime = Date.now();

    try {
      ShortlistingLogger.logShortlisting(
        `Starting cohort member shortlisting evaluation with batch size: ${batchSize}, max concurrent batches: ${maxConcurrentBatches}`,
        'ShortlistingEvaluation'
      );

      // Step 1: Process Active Cohorts
      const currentDateUTC = new Date().toISOString().split('T')[0]; // Use UTC date for timezone consistency
      const activeCohorts = await this.processActiveCohorts(
        tenantId,
        academicyearId,
        userId,
        shortlistDateFieldId,
        currentDateUTC
      );

      if (activeCohorts.length === 0) {
        ShortlistingLogger.logShortlisting(
          'No active cohorts found with shortlist date today or earlier',
          'ShortlistingEvaluation'
        );
        return [];
      }

      ShortlistingLogger.logShortlisting(
        `Found ${activeCohorts.length} active cohorts with shortlist date today or earlier`,
        'ShortlistingEvaluation'
      );

      // Step 2: Evaluate Each Cohort
      const cohortResults = [];
      for (const cohort of activeCohorts) {
        const cohortResult = await this.evaluateCohortForShortlisting(
          cohort,
          tenantId,
          batchSize,
          maxConcurrentBatches,
          apiId,
          userId
        );
        cohortResults.push(cohortResult);
      }

      // Step 3: Aggregate Results
      const aggregatedResults = this.aggregateResults(cohortResults);

      // Step 4: Calculate Performance Metrics
      const totalTime = Date.now() - startTime;
      const performanceMetrics = this.calculatePerformanceMetrics(
        aggregatedResults.totalProcessed,
        totalTime,
        batchSize,
        maxConcurrentBatches
      );

      // Return comprehensive results with performance metrics
      return {
        ...aggregatedResults,
        ...performanceMetrics,
        message: 'Cohort member shortlisting evaluation completed successfully',
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;

      ShortlistingLogger.logShortlistingError(
        `Error in cohort member shortlisting evaluation after ${totalTime}ms`,
        error.message,
        'ShortlistingEvaluation'
      );

      throw error;
    }
  }

  /**
   * Processes cohort members in parallel batches for optimal performance
   * Implements controlled concurrency to balance performance with system resources
   *
   * This method:
   * 1. Divides members into batches of specified size
   * 2. Processes multiple batches concurrently (controlled by maxConcurrentBatches)
   * 3. Provides real-time progress updates
   * 4. Aggregates results from all batches
   *
   * Performance optimization:
   * - Pre-fetches field values for entire batches to reduce database calls
   * - Processes batches in parallel for I/O bound operations
   * - Provides progress logging for long-running operations
   * - Handles individual batch failures gracefully
   *
   * @param members - Array of cohort members to process
   * @param formFieldsAndRules - Form fields and rules for evaluation
   * @param cohortId - The cohort ID being processed
   * @param batchSize - Number of records per batch
   * @param maxConcurrentBatches - Maximum number of batches to process concurrently
   * @param apiId - API ID for logging context
   * @returns Promise with aggregated processing results
   */
  private async processCohortMembersInParallel(
    members: any[],
    formFieldsAndRules: any[],
    cohortId: string,
    batchSize: number,
    maxConcurrentBatches: number,
    apiId: string,
    userId: string
  ) {
    let totalProcessed = 0;
    let totalShortlisted = 0;
    let totalRejected = 0;
    let totalFailures = 0;

    // Create batches of specified size
    const batches = [];
    for (let i = 0; i < members.length; i += batchSize) {
      batches.push(members.slice(i, i + batchSize));
    }

    ShortlistingLogger.logShortlisting(
      `Processing ${batches.length} batches for cohort ${cohortId} with max ${maxConcurrentBatches} concurrent batches`,
      'ShortlistingEvaluation'
    );

    // Process batches with controlled concurrency to avoid overwhelming the system
    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const currentBatches = batches.slice(i, i + maxConcurrentBatches);

      // Process current batch group in parallel
      const batchPromises = currentBatches.map((batch, batchIndex) =>
        this.processCohortMembersBatch(
          batch,
          formFieldsAndRules,
          cohortId,
          apiId,
          i + batchIndex + 1,
          batches.length,
          userId
        )
      );

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results from all batches in this group
      batchResults.forEach((result, index) => {
        totalProcessed += result.processed;
        totalShortlisted += result.shortlisted;
        totalRejected += result.rejected;
        totalFailures += result.failures;
      });

      // Log progress every 10 batch groups to provide visibility into long-running operations
      if ((i / maxConcurrentBatches + 1) % 10 === 0) {
        ShortlistingLogger.logShortlisting(
          `Cohort ${cohortId}: Completed ${Math.min(
            i + maxConcurrentBatches,
            batches.length
          )}/${
            batches.length
          } batches. Progress: ${totalProcessed} records processed`,
          'ShortlistingEvaluation'
        );
      }
    }

    return {
      processed: totalProcessed,
      shortlisted: totalShortlisted,
      rejected: totalRejected,
      failures: totalFailures,
    };
  }

  /**
   * Processes a single batch of cohort members
   * Handles individual member evaluation, status updates, and email notifications
   *
   * This method:
   * 1. Pre-fetches field values for all members in the batch (optimization)
   * 2. Evaluates each member against form rules
   * 3. Updates member status using the existing updateCohortMembers method
   * 4. Logs failures for manual review
   * 5. Tracks performance metrics for monitoring
   *
   * Performance optimizations:
   * - Batch field value fetching reduces database calls
   * - Individual error handling prevents batch failures
   * - Performance monitoring for slow batches
   * - Detailed failure logging for troubleshooting
   *
   * @param members - Array of cohort members in this batch
   * @param formFieldsAndRules - Form fields and rules for evaluation
   * @param cohortId - The cohort ID being processed
   * @param apiId - API ID for logging context
   * @param batchNumber - Current batch number for logging
   * @param totalBatches - Total number of batches for progress tracking
   * @param userId - The user ID for updates
   * @returns Promise with batch processing results
   */
  private async processCohortMembersBatch(
    members: any[],
    formFieldsAndRules: any[],
    cohortId: string,
    apiId: string,
    batchNumber: number,
    totalBatches: number,
    userId: string
  ) {
    let processed = 0;
    let shortlisted = 0;
    let rejected = 0;
    let failures = 0;

    const batchStartTime = Date.now();
    // Pre-fetch all user field values for this batch to reduce database calls
    // This optimization significantly improves performance for large batches
    // Skip field value fetching if no rules exist (automatic shortlisting)
    let userFieldValuesMap = new Map();
    if (formFieldsAndRules && formFieldsAndRules.length > 0) {
      const userIds = members.map((m) => m.userId);
      userFieldValuesMap = await this.getBatchUserFieldValues(userIds);
    }

    // Process each member in the batch
    for (const member of members) {
      try {
        // Get pre-fetched field values for this user (empty array if no rules exist)
        const userFieldValues = userFieldValuesMap.get(member.userId) || [];

        // Step 6: Evaluate rules and determine status
        const evaluationResult = await this.evaluateMemberRules(
          member,
          userFieldValues,
          formFieldsAndRules
        );

        // Step 7: Update member status using the optimized batch update method
        // This skips email notifications for better performance
        await this.updateMemberStatusForBatch(
          member.cohortMembershipId,
          evaluationResult,
          apiId,
          userId
        );

        // Update counters
        processed++;
        if (evaluationResult.status === 'shortlisted') {
          shortlisted++;
        } else {
          rejected++;
        }
      } catch (error) {
        // Handle individual member failures gracefully
        failures++;

        ShortlistingLogger.logShortlistingError(
          `Failed to process member ${member.userId} in batch ${batchNumber}/${totalBatches}`,
          error.message,
          'ShortlistingEvaluation'
        );

        // Log failure to CSV for manual review and analysis
        ShortlistingLogger.logFailure({
          dateTime: new Date().toISOString(),
          cohortId: cohortId,
          userId: member.userId,
          emailSentStatus: 'FAILED',
          failureReason: error.message,
        });
      }
    }

    // Performance monitoring - log slow batches for optimization
    const batchTime = Date.now() - batchStartTime;

    if (batchTime > 5000) {
      // Log slow batches (>5 seconds)
      ShortlistingLogger.logShortlisting(
        `Slow batch detected: Batch ${batchNumber}/${totalBatches} took ${batchTime}ms for ${processed} records`,
        'ShortlistingEvaluation',
        undefined,
        'warn'
      );
    }

    return { processed, shortlisted, rejected, failures };
  }

  /**
   * Updates a cohort member's status for batch processing (optimized for performance)
   * Skips email notifications to improve batch processing speed
   *
   * @param cohortMembershipId - The cohort membership ID to update
   * @param evaluationResult - The evaluation result with status and reason
   * @param apiId - API ID for logging context
   * @param userId - The user ID from the authenticated request
   * @returns Promise that resolves when update is complete
   */
  private async updateMemberStatusForBatch(
    cohortMembershipId: string,
    evaluationResult: any,
    apiId: string,
    userId: string
  ) {
    try {
      // Direct database update without email notifications for better performance
      const updateResult = await this.cohortMembersRepository.update(
        { cohortMembershipId: cohortMembershipId },
        {
          status: evaluationResult.status,
          statusReason: evaluationResult.statusReason,
          updatedBy: userId,
          updatedAt: new Date(),
        }
      );

      if (updateResult.affected === 0) {
        throw new Error(
          `No records updated for cohortMembershipId: ${cohortMembershipId}`
        );
      }

      // Get the cohort member details to get userId and cohortId for Elasticsearch update
      let cohortMemberDetails = await this.cohortMembersRepository.findOne({
        where: { cohortMembershipId: cohortMembershipId },
        select: ['userId', 'cohortId'],
      });

      // NEW: Handle LMS enrollment for shortlisted users
      if (evaluationResult.status === 'shortlisted' && cohortMemberDetails) {
        await this.enrollShortlistedUserToLMSCourses(
          cohortMemberDetails.userId,
          cohortMemberDetails.cohortId
        );
      }

      // CRON JOB ELASTICSEARCH UPDATE: Update Elasticsearch when cron job changes status
      // This ensures data consistency between database and Elasticsearch for automated status changes
      // Only updates the status fields without affecting other application data (progress, formData, etc.)
      if (isElasticsearchEnabled()) {
        try {
          if (cohortMemberDetails) {
            // Use the existing field-specific update method to preserve all existing data
            // FIXED: Update cohortmemberstatus instead of status to match Elasticsearch structure
            await this.updateElasticsearchWithFieldSpecificChanges(
              cohortMemberDetails.userId,
              cohortMemberDetails.cohortId,
              {
                cohortmemberstatus: evaluationResult.status, // FIXED: Use cohortmemberstatus instead of status
                statusReason: evaluationResult.statusReason,
              },
              null // existingApplication is null since we're doing a minimal update
            );
          }
        } catch (elasticsearchError) {
          // Log the error but don't fail the entire cron job
          // This ensures that database updates and email notifications succeed even if Elasticsearch fails
          LoggerUtil.error(
            'Failed to update Elasticsearch during cron job status update',
            `CohortMembershipId: ${cohortMembershipId}, Error: ${elasticsearchError.message}`,
            'CRON_JOB_ELASTICSEARCH_UPDATE'
          );
        }
      }

      // NEW REQUIREMENT: Only send email notifications for 'shortlisted' status
      const enableEmailNotifications =
        process.env.ENABLE_SHORTLISTING_EMAILS !== 'false';

      if (
        enableEmailNotifications &&
        evaluationResult.status === 'shortlisted'
      ) {
        try {
          // Get user and cohort data for email
          const [userData, cohortData] = await Promise.all([
            this.usersRepository.findOne({
              where: { userId: evaluationResult.userId || cohortMembershipId },
              select: ['userId', 'email', 'firstName', 'lastName'], // force select email field
            }),
            this.cohortRepository.findOne({
              where: { cohortId: evaluationResult.cohortId },
            }),
          ]);

          if (userData?.email) {
            const notificationPayload = {
              isQueue: false,
              context: 'USER',
              key: 'onStudentShortlisted', // Only shortlisted template
              replacements: {
                '{username}': `${userData.firstName ?? ''} ${
                  userData.lastName ?? ''
                }`.trim(),
                '{firstName}': userData.firstName ?? '',
                '{lastName}': userData.lastName ?? '',
                '{programName}': cohortData?.name ?? 'the program',
                '{status}': evaluationResult.status,
                '{statusReason}':
                  evaluationResult.statusReason ?? 'Not specified',
              },
              email: {
                receipients: [userData.email],
              },
            };

            const mailSend = await this.notificationRequest.sendNotification(
              notificationPayload
            );

            if (mailSend?.result?.email?.errors?.length > 0) {
              // Log email failure
              ShortlistingLogger.logEmailFailure({
                dateTime: new Date().toISOString(),
                userId: userData.userId,
                email: userData.email,
                shortlistedStatus: 'shortlisted', // Only shortlisted status
                failureReason: mailSend.result.email.errors.join(', '),
                cohortId: evaluationResult.cohortId,
              });
            } else {
              // Log email success
              ShortlistingLogger.logEmailSuccess({
                dateTime: new Date().toISOString(),
                userId: userData.userId,
                email: userData.email,
                shortlistedStatus: 'shortlisted', // Only shortlisted status
                cohortId: evaluationResult.cohortId,
              });
            }
          } else {
            // Log email failure for missing email
            ShortlistingLogger.logEmailFailure({
              dateTime: new Date().toISOString(),
              userId: evaluationResult.userId || cohortMembershipId,
              email: 'No email found',
              shortlistedStatus: 'shortlisted', // Only shortlisted status
              failureReason: `No email found for user ${
                evaluationResult.userId || cohortMembershipId
              }`,
              cohortId: evaluationResult.cohortId,
            });
          }
        } catch (emailError) {
          // Log email failure
          ShortlistingLogger.logEmailFailure({
            dateTime: new Date().toISOString(),
            userId: evaluationResult.userId || cohortMembershipId,
            email: 'Unknown',
            shortlistedStatus: 'shortlisted', // Only shortlisted status
            failureReason: emailError.message,
            cohortId: evaluationResult.cohortId,
          });
        }
      }
    } catch (error) {
      // Log the error and re-throw for batch processing error handling
      ShortlistingLogger.logShortlistingError(
        `Failed to batch update member status for ${cohortMembershipId}`,
        error.message,
        'ShortlistingEvaluation'
      );
      throw error;
    }
  }

  /**
   * Fetches field values for multiple users in a single database query
   * Optimizes performance by reducing database calls for batch processing
   *
   * This method:
   * 1. Executes a single query to fetch all field values for all users in the batch
   * 2. Groups results by userId for efficient lookup
   * 3. Includes field metadata (type, label) for rule evaluation
   * 4. Handles different field types (text, numeric, calendar, dropdown, etc.)
   *
   * Performance benefits:
   * - Reduces database calls from N (one per user) to 1 (one per batch)
   * - Uses efficient PostgreSQL ANY operator for batch queries
   * - Includes field metadata to avoid additional queries
   *
   * @param userIds - Array of user IDs to fetch field values for
   * @returns Promise with Map of userId -> field values array
   */
  private async getBatchUserFieldValues(userIds: string[]) {
    if (userIds.length === 0) return new Map();

    // Optimized query with better indexing and reduced data transfer
    const query = `
      SELECT 
        fv."fieldId",
        fv."textValue",
        fv."numberValue",
        fv."calendarValue",
        fv."dropdownValue",
        fv."radioValue",
        fv."checkboxValue",
        fv."textareaValue",
        fv."itemId",
        f."type",
        f."label"
      FROM public."FieldValues" fv
      INNER JOIN public."Fields" f ON fv."fieldId" = f."fieldId"
      WHERE fv."itemId" = ANY($1)
      AND fv."itemId" IS NOT NULL
      ORDER BY fv."itemId", fv."fieldId"
    `;

    const results = await this.fieldValuesRepository.query(query, [userIds]);

    // Optimized grouping with Map for better performance
    const userFieldValuesMap = new Map();
    for (const fv of results) {
      const userId = fv.itemId;
      if (!userFieldValuesMap.has(userId)) {
        userFieldValuesMap.set(userId, []);
      }
      userFieldValuesMap.get(userId).push(fv);
    }

    return userFieldValuesMap;
  }

  /**
   * Fetches active cohorts that have a shortlist date less than or equal to today's UTC date
   * Uses the configured shortlist date field to identify cohorts for processing
   *
   * This method handles timezone consistency and missed cron executions by including
   * cohorts with shortlist dates from previous days that may have been missed
   *
   * @param shortlistDateFieldId - The field ID for the shortlist date field
   * @param currentDateUTC - Current UTC date in YYYY-MM-DD format
   * @returns Promise with array of active cohorts for processing
   */
  private async getActiveCohortsWithShortlistDate(
    shortlistDateFieldId: string,
    currentDateUTC: string
  ) {
    // Optimized query with better indexing and reduced data transfer
    const query = `
      SELECT DISTINCT 
        c."cohortId", 
        c."name", 
        c."status"
      FROM public."Cohort" c
      INNER JOIN public."FieldValues" fv ON c."cohortId" = fv."itemId"
      WHERE c."status" = 'active'
      AND fv."fieldId" = $1
      AND fv."calendarValue"::date <= $2::date
      AND fv."itemId" IS NOT NULL
      ORDER BY c."cohortId"
    `;

    const results = await this.cohortRepository.query(query, [
      shortlistDateFieldId,
      currentDateUTC,
    ]);

    return results;
  }

  /**
   * Fetches active forms for a specific cohort
   * Retrieves forms with context 'COHORTMEMBER' for rule evaluation
   *
   * @param cohortId - The cohort ID to fetch forms for
   * @param tenantId - The tenant ID for the form search
   * @returns Promise with array of active forms
   */
  private async getActiveFormsForCohort(cohortId: string, tenantId: string) {
    // Find forms with the specific cohortId as contextId and tenantId
    const forms = await this.formsService.getFormDetail(
      'COHORTMEMBER',
      'COHORTMEMBER',
      tenantId,
      cohortId
    );

    // Filter to only active forms
    const activeForms = forms.filter((form) => form.status === 'active');
    return activeForms;
  }

  /**
   * Extracts fields and rules from form data
   * Prepares form data for rule evaluation with the new nested logic structure
   * Note: FieldId validation is now done at the cohort level in the main evaluation method
   *
   * @param forms - Array of form objects
   * @returns Promise with array of form fields and rules
   */
  private async getFormFieldsAndRules(forms: any[]) {
    const fieldsAndRules = [];

    for (const form of forms) {
      if (form.fields && form.rules) {
        // Validate that rules have the required structure
        if (form.rules.logic && form.rules.conditions) {
          fieldsAndRules.push({
            formId: form.formid,
            fields: form.fields,
            rules: form.rules, // Keep the entire rules object with logic and conditions
          });
        } else {
          LoggerUtil.warn(
            `Form ${form.formid} has rules but invalid structure. Expected logic and conditions properties.`,
            'ShortlistingEvaluation'
          );
        }
      }
    }
    return fieldsAndRules;
  }

  /**
   * Fetches cohort members with 'submitted' status for a specific cohort
   * These are the members that need to be evaluated for shortlisting
   *
   * @param cohortId - The cohort ID to fetch members for
   * @returns Promise with array of submitted cohort members
   */
  private async getSubmittedCohortMembers(cohortId: string) {
    // Optimized query with proper indexing and LIMIT for batch processing
    const query = `
      SELECT 
        cm."cohortMembershipId",
        cm."cohortId",
        cm."userId",
        cm."status",
        cm."statusReason",
        cm."createdAt",
        cm."updatedAt"
      FROM public."CohortMembers" cm
      WHERE cm."cohortId" = $1 
      AND cm."status" = 'submitted'
      ORDER BY cm."createdAt" ASC
      LIMIT $2
    `;

    const batchSize = parseInt(process.env.BATCH_SIZE) || 5000;
    const members = await this.cohortMembersRepository.query(query, [
      cohortId,
      batchSize,
    ]);

    return members;
  }

  /**
   * Recursively extracts all fieldIds from a rule structure
   * Handles nested AND/OR logic groups and individual conditions
   *
   * @param rules - The rule object to extract fieldIds from
   * @returns Array of fieldIds found in the rules
   */
  private extractFieldIdsFromRules(rules: any): string[] {
    const fieldIds: string[] = [];

    if (!rules || !rules.conditions || !Array.isArray(rules.conditions)) {
      return fieldIds;
    }

    for (const condition of rules.conditions) {
      // Check if this is a nested group
      if (condition.logic && condition.conditions) {
        // Recursively extract fieldIds from nested groups
        const nestedFieldIds = this.extractFieldIdsFromRules(condition);
        fieldIds.push(...nestedFieldIds);
      } else if (condition.fieldId) {
        // This is a leaf condition with a fieldId
        fieldIds.push(condition.fieldId);
      }
    }

    return fieldIds;
  }

  /**
   * Extracts fieldIds from form fields array by recursively traversing the JSON schema
   * Handles nested object structures with properties
   *
   * @param fields - Array of form field objects or single field object
   * @returns Array of fieldIds from the form fields
   */
  private extractFieldIdsFromFormFields(fields: any[]): string[] {
    if (!fields || !Array.isArray(fields)) {
      return [];
    }

    const fieldIds: string[] = [];

    for (const field of fields) {
      // Handle the case where field has a 'result' array with schema
      if (field && field.result && Array.isArray(field.result)) {
        for (const resultItem of field.result) {
          if (resultItem && resultItem.schema && resultItem.schema.properties) {
            const schemaFieldIds = this.extractFieldIdsFromSchema(
              resultItem.schema
            );
            fieldIds.push(...schemaFieldIds);
          }
        }
      } else if (field && field.schema && field.schema.properties) {
        // This is a JSON schema structure, extract fieldIds recursively
        const schemaFieldIds = this.extractFieldIdsFromSchema(field.schema);
        fieldIds.push(...schemaFieldIds);
      } else if (field && field.fieldId) {
        // This is a simple field object
        fieldIds.push(field.fieldId);
      }
    }

    return fieldIds;
  }

  /**
   * Recursively extracts fieldIds from a JSON schema structure
   * Traverses nested properties to find all fieldId values
   *
   * @param schema - The JSON schema object
   * @returns Array of fieldIds found in the schema
   */
  private extractFieldIdsFromSchema(schema: any): string[] {
    const fieldIds: string[] = [];

    if (!schema || !schema.properties) {
      return fieldIds;
    }

    // Recursively traverse all properties
    for (const [key, property] of Object.entries(schema.properties)) {
      if (property && typeof property === 'object') {
        // Check if this property has a fieldId
        if ((property as any).fieldId) {
          fieldIds.push((property as any).fieldId);
        }

        // If this property has nested properties, recurse
        if ((property as any).properties) {
          const nestedFieldIds = this.extractFieldIdsFromSchema(
            property as any
          );
          fieldIds.push(...nestedFieldIds);
        }
      }
    }

    return fieldIds;
  }

  /**
   * Evaluates form rules against a member's field values using recursive logic evaluation
   * Determines whether a member should be shortlisted or rejected based on nested AND/OR conditions
   *
   * This method:
   * 1. Handles the case where no forms/rules are defined (skip processing)
   * 2. Creates a map of field values for efficient lookup
   * 3. Recursively evaluates nested rule structures with AND/OR logic
   * 4. Handles array values for flexible matching
   * 5. Tracks failed conditions for detailed status reasons
   * 6. Returns evaluation result with status and reason
   *
   * @param member - The cohort member to evaluate
   * @param userFieldValues - Array of field values for the member
   * @param formFieldsAndRules - Array of form fields and rules
   * @returns Promise with evaluation result (status and statusReason)
   */
  private async evaluateMemberRules(
    member: any,
    userFieldValues: any[],
    formFieldsAndRules: any[]
  ) {
    // If no forms or rules are defined for this cohort, skip processing
    if (!formFieldsAndRules || formFieldsAndRules.length === 0) {
      return {
        status: 'submitted', // Keep original status, don't process
        statusReason:
          'No evaluation rules defined for this cohort - skipping shortlisting process',
        userId: member.userId,
        cohortId: member.cohortId,
      };
    }

    // Create efficient lookup map for field values
    const fieldValuesMap = new Map();
    userFieldValues.forEach((fv) => {
      fieldValuesMap.set(fv.fieldId, {
        value: this.getTypedValue(fv),
        label: fv.label,
      });
    });
    let allRulesPass = true;
    const failedConditions = [];

    // Evaluate rules from all forms
    for (const formRule of formFieldsAndRules) {
      if (formRule.rules && formRule.rules.logic && formRule.rules.conditions) {
        const evaluationResult = this.evaluateRuleGroup(
          formRule.rules,
          fieldValuesMap,
          failedConditions
        );

        if (!evaluationResult) {
          allRulesPass = false;
        }
      }
    }

    const finalStatus = allRulesPass ? 'shortlisted' : 'rejected';
    const finalReason = allRulesPass
      ? this.formatShortlistedReason()
      : this.formatStatusReason(failedConditions);

    return {
      status: finalStatus,
      statusReason: finalReason,
      userId: member.userId,
      cohortId: member.cohortId,
    };
  }

  /**
   * Recursively evaluates a rule group with nested AND/OR logic
   * Handles both grouped conditions and individual field conditions
   *
   * @param ruleGroup - The rule group to evaluate (contains logic and conditions)
   * @param fieldValuesMap - Map of user's field values for efficient lookup
   * @param failedConditions - Array to collect failed conditions for status reason
   * @returns true if the rule group evaluates to true, false otherwise
   */
  private evaluateRuleGroup(
    ruleGroup: any,
    fieldValuesMap: Map<string, any>,
    failedConditions: any[]
  ): boolean {
    const { logic, conditions } = ruleGroup;

    if (!conditions || !Array.isArray(conditions)) {
      return true; // No conditions means pass
    }

    const results = conditions.map((condition, index) => {
      // Check if this is a nested group
      if (condition.logic && condition.conditions) {
        return this.evaluateRuleGroup(
          condition,
          fieldValuesMap,
          failedConditions
        );
      }

      // This is a leaf condition (individual field check)
      return this.evaluateCondition(
        condition,
        fieldValuesMap,
        failedConditions
      );
    });

    // Apply the logic (AND/OR) to combine results
    let finalResult;
    if (logic === 'AND') {
      finalResult = results.every((result) => result === true);
    } else if (logic === 'OR') {
      finalResult = results.some((result) => result === true);
    } else {
      // Default to AND if logic is not specified
      finalResult = results.every((result) => result === true);
    }

    return finalResult;
  }

  /**
   * Evaluates a single condition against a user's field value
   * Handles both single values and arrays for flexible matching
   *
   * @param condition - The condition to evaluate (fieldName, fieldId, value)
   * @param fieldValuesMap - Map of user's field values for efficient lookup
   * @param failedConditions - Array to collect failed conditions for status reason
   * @returns true if condition passes, false otherwise
   */
  private evaluateCondition(
    condition: any,
    fieldValuesMap: Map<string, any>,
    failedConditions: any[]
  ): boolean {
    const { fieldName, fieldId, value } = condition;

    const fieldValue = fieldValuesMap.get(fieldId);

    // Handle missing field values
    if (!fieldValue) {
      failedConditions.push({
        fieldLabel: fieldName || 'Unknown Field',
        expectedValue: Array.isArray(value) ? value.join(', ') : value,
        submittedValue: 'Not submitted',
      });
      return false;
    }

    const submittedValue = fieldValue.value;

    const isMatch = this.compareValues(submittedValue, value);

    if (!isMatch) {
      failedConditions.push({
        fieldLabel: fieldName || fieldValue.label,
        expectedValue: Array.isArray(value) ? value.join(', ') : value,
        submittedValue: submittedValue,
      });
    }

    return isMatch;
  }

  /**
   * Compares a submitted value against an expected value
   * Handles both single values and arrays for flexible matching
   * Supports case insensitive comparison and comma-separated values
   *
   * @param submittedValue - The value submitted by the user
   * @param expectedValue - The expected value (single value or array)
   * @returns true if values match, false otherwise
   */
  private compareValues(submittedValue: any, expectedValue: any): boolean {
    // Handle null/undefined values
    if (!submittedValue && !expectedValue) return true;
    if (!submittedValue || !expectedValue) return false;

    // Convert submitted value to string and normalize
    const submittedStr = String(submittedValue).trim().toLowerCase();

    // Handle array expected values
    if (Array.isArray(expectedValue)) {
      const expectedStrings = expectedValue.map((val) =>
        String(val).trim().toLowerCase()
      );
      return expectedStrings.some((expected) =>
        this.valuesMatch(submittedStr, expected)
      );
    }

    // Handle single expected value
    const expectedStr = String(expectedValue).trim().toLowerCase();
    return this.valuesMatch(submittedStr, expectedStr);
  }

  /**
   * Compares two values with support for comma-separated values and case insensitive matching
   *
   * @param submittedValue - The submitted value (normalized to lowercase)
   * @param expectedValue - The expected value (normalized to lowercase)
   * @returns true if values match, false otherwise
   */
  private valuesMatch(submittedValue: string, expectedValue: string): boolean {
    // Direct match
    if (submittedValue === expectedValue) return true;

    // Handle comma-separated values in submitted value
    if (submittedValue.includes(',')) {
      const submittedArray = submittedValue.split(',').map((val) => val.trim());
      return submittedArray.some((val) => val === expectedValue);
    }

    // Handle comma-separated values in expected value
    if (expectedValue.includes(',')) {
      const expectedArray = expectedValue.split(',').map((val) => val.trim());
      return expectedArray.some((val) => val === submittedValue);
    }

    // Handle both having comma-separated values
    if (submittedValue.includes(',') && expectedValue.includes(',')) {
      const submittedArray = submittedValue.split(',').map((val) => val.trim());
      const expectedArray = expectedValue.split(',').map((val) => val.trim());
      return submittedArray.some((submitted) =>
        expectedArray.includes(submitted)
      );
    }

    return false;
  }

  /**
   * Extracts the appropriate value from a field value based on field type
   * Handles different field types (text, numeric, calendar, dropdown, etc.)
   *
   * @param fieldValue - Field value object with type and various value fields
   * @returns The appropriate value for the field type
   */
  private getTypedValue(fieldValue: any) {
    switch (fieldValue.type) {
      case 'text':
      case 'textarea':
        return fieldValue.textValue || fieldValue.textareaValue;
      case 'numeric':
        return fieldValue.numberValue;
      case 'calendar':
        return fieldValue.calendarValue;
      case 'drop_down':
        return fieldValue.dropdownValue;
      case 'radio':
        return fieldValue.radioValue;
      case 'checkbox':
        return fieldValue.checkboxValue;
      default:
        return fieldValue.textValue;
    }
  }

  /**
   * Formats failed conditions into a readable status reason
   * Creates detailed failure messages for rejected members
   *
   * @param failedConditions - Array of failed condition objects
   * @returns Formatted status reason string
   */
  private formatStatusReason(failedConditions: any[]): string {
    if (!failedConditions || failedConditions.length === 0) {
      return 'Evaluation failed - no specific reason available';
    }

    return failedConditions
      .map(
        (condition) =>
          `${condition.fieldLabel}: Expected "${condition.expectedValue}", Submitted "${condition.submittedValue}"`
      )
      .join('; ');
  }

  /**
   * Formats a positive status reason for shortlisted members
   * Provides confirmation that all shortlisting criteria were met
   *
   * @returns Formatted status reason string for shortlisted members
   */
  private formatShortlistedReason(): string {
    return 'Congratulations! Your application has been shortlisted. All required shortlisting criteria have been met successfully.';
  }

  /**
   * Recursively extracts all fieldId values from any object (fields or rules)
   * @param obj - The object to search
   * @returns Array of all fieldIds found
   */
  private extractAllFieldIds(obj: any): string[] {
    const fieldIds: string[] = [];
    if (!obj) return fieldIds;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        fieldIds.push(...this.extractAllFieldIds(item));
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (key === 'fieldId' && typeof obj[key] === 'string') {
          fieldIds.push(obj[key]);
        } else {
          fieldIds.push(...this.extractAllFieldIds(obj[key]));
        }
      }
    }
    return fieldIds;
  }

  private validateFormFieldIds(formFieldsAndRules: any[]): {
    isValid: boolean;
    invalidFieldIds: string[];
    invalidFormIds: string[];
  } {
    const invalidFieldIds: string[] = [];
    const invalidFormIds: string[] = [];

    for (const form of formFieldsAndRules) {
      // Extract all fieldIds from fields and rules
      const formFieldIds = this.extractAllFieldIds(form.fields);
      const ruleFieldIds = this.extractAllFieldIds(form.rules);
      // Find rule fieldIds not present in form fieldIds
      const missingFieldIds = ruleFieldIds.filter(
        (fieldId) => !formFieldIds.includes(fieldId)
      );
      if (missingFieldIds.length > 0) {
        invalidFieldIds.push(...missingFieldIds);
        invalidFormIds.push(form.formId);
      }
    }
    const result = {
      isValid: invalidFieldIds.length === 0,
      invalidFieldIds: [...new Set(invalidFieldIds)],
      invalidFormIds: [...new Set(invalidFormIds)],
    };
    return result;
  }

  /**
   * Main orchestration method for processing active cohorts
   * Handles the high-level flow of shortlisting evaluation
   *
   * This method processes cohorts with shortlist dates less than or equal to today's UTC date,
   * ensuring timezone consistency and recovery from missed cron executions.
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @param shortlistDateFieldId - The field ID for shortlist date
   * @param currentDateUTC - Current UTC date in YYYY-MM-DD format
   * @returns Promise with active cohorts to process
   */
  private async processActiveCohorts(
    tenantId: string,
    academicyearId: string,
    userId: string,
    shortlistDateFieldId: string,
    currentDateUTC: string
  ) {
    // Step 1: Fetch Active Cohorts with Shortlist Date = Today
    const activeCohorts = await this.getActiveCohortsWithShortlistDate(
      shortlistDateFieldId,
      currentDateUTC
    );

    if (activeCohorts.length === 0) {
      ShortlistingLogger.logShortlisting(
        'No active cohorts found with shortlist date today or earlier',
        'ShortlistingEvaluation'
      );
      return [];
    }

    ShortlistingLogger.logShortlisting(
      `Found ${activeCohorts.length} active cohorts with shortlist date today or earlier`,
      'ShortlistingEvaluation'
    );

    return activeCohorts;
  }

  /**
   * Evaluates a single cohort for shortlisting
   * Handles form validation, member processing, and result aggregation for one cohort
   *
   * @param cohort - The cohort to evaluate
   * @param tenantId - The tenant ID for the evaluation context
   * @param batchSize - Number of records per batch
   * @param maxConcurrentBatches - Maximum number of batches to process concurrently
   * @param apiId - API ID for logging context
   * @param userId - The user ID for updates
   * @returns Promise with cohort processing results
   */
  private async evaluateCohortForShortlisting(
    cohort: any,
    tenantId: string,
    batchSize: number,
    maxConcurrentBatches: number,
    apiId: string,
    userId: string
  ) {
    const cohortStartTime = Date.now();
    ShortlistingLogger.logShortlisting(
      `Processing cohort: ${cohort.cohortId} (${cohort.name})`,
      'ShortlistingEvaluation'
    );

    // Step 2: Fetch Active Forms for this cohort
    const activeForms = await this.getActiveFormsForCohort(
      cohort.cohortId,
      tenantId
    );

    // Step 3: Get Fields and Rules from each form (if forms exist)
    let formFieldsAndRules: any[] = [];
    if (activeForms.length > 0) {
      formFieldsAndRules = await this.getFormFieldsAndRules(activeForms);

      ShortlistingLogger.logShortlisting(
        `Found ${activeForms.length} active forms with rules for cohort: ${cohort.cohortId}`,
        'ShortlistingEvaluation'
      );
    } else {
      ShortlistingLogger.logShortlisting(
        `No active forms found for cohort: ${cohort.cohortId}. Skipping shortlisting process for this cohort.`,
        'ShortlistingEvaluation'
      );
      return {
        processed: 0,
        shortlisted: 0,
        rejected: 0,
        failures: 0,
        processingTime: 0,
      };
    }

    // Check if any forms have valid rules structure and valid fieldIds
    const hasValidRules = formFieldsAndRules.some(
      (form) => form.rules && form.rules.logic && form.rules.conditions
    );

    if (!hasValidRules) {
      ShortlistingLogger.logShortlisting(
        `No valid rules structure found for cohort: ${cohort.cohortId}. Skipping shortlisting process for this cohort.`,
        'ShortlistingEvaluation'
      );
      return {
        processed: 0,
        shortlisted: 0,
        rejected: 0,
        failures: 0,
        processingTime: 0,
      };
    }

    // Validate that all fieldIds in rules exist in form fields
    const validationResult = this.validateFormFieldIds(formFieldsAndRules);

    if (!validationResult.isValid) {
      ShortlistingLogger.logShortlistingError(
        `Cohort ${
          cohort.cohortId
        } has forms with invalid fieldIds: ${validationResult.invalidFieldIds.join(
          ', '
        )}. Skipping shortlisting evaluation for this cohort.`,
        `Form IDs with invalid fieldIds: ${validationResult.invalidFormIds.join(
          ', '
        )}`,
        'ShortlistingEvaluation'
      );
      return {
        processed: 0,
        shortlisted: 0,
        rejected: 0,
        failures: 0,
        processingTime: 0,
      };
    }

    // Step 4: Get "Submitted" Cohort Members for this cohort
    const submittedMembers = await this.getSubmittedCohortMembers(
      cohort.cohortId
    );

    if (submittedMembers.length === 0) {
      ShortlistingLogger.logShortlisting(
        `No submitted members found for cohort: ${cohort.cohortId}`,
        'ShortlistingEvaluation'
      );
      return {
        processed: 0,
        shortlisted: 0,
        rejected: 0,
        failures: 0,
        processingTime: 0,
      };
    }

    ShortlistingLogger.logShortlisting(
      `Found ${submittedMembers.length} submitted members for cohort: ${cohort.cohortId}`,
      'ShortlistingEvaluation'
    );

    // Step 5: Process members in parallel batches for optimal performance
    const batchResults = await this.processCohortMembersInParallel(
      submittedMembers,
      formFieldsAndRules,
      cohort.cohortId,
      batchSize,
      maxConcurrentBatches,
      apiId,
      userId
    );

    const cohortProcessingTime = Date.now() - cohortStartTime;

    ShortlistingLogger.logShortlisting(
      `Cohort ${cohort.cohortId} completed in ${cohortProcessingTime}ms. Processed: ${batchResults.processed}, Shortlisted: ${batchResults.shortlisted}, Rejected: ${batchResults.rejected}, Failures: ${batchResults.failures}`,
      'ShortlistingEvaluation'
    );

    return {
      ...batchResults,
      processingTime: cohortProcessingTime,
    };
  }

  /**
   * Aggregates results from multiple cohort processing operations
   * Combines individual cohort results into overall performance metrics
   *
   * @param cohortResults - Array of results from individual cohort processing
   * @returns Aggregated results with total counts and processing time
   */
  private aggregateResults(cohortResults: any[]) {
    let totalProcessed = 0;
    let totalShortlisted = 0;
    let totalRejected = 0;
    let totalFailures = 0;
    let totalProcessingTime = 0;

    cohortResults.forEach((result) => {
      totalProcessed += result.processed;
      totalShortlisted += result.shortlisted;
      totalRejected += result.rejected;
      totalFailures += result.failures;
      totalProcessingTime += result.processingTime;
    });

    return {
      totalProcessed,
      totalShortlisted,
      totalRejected,
      totalFailures,
      totalProcessingTime,
    };
  }

  /**
   * Calculates and formats performance metrics for the shortlisting evaluation
   * Provides insights into processing speed and system capacity
   *
   * @param totalProcessed - Total number of records processed
   * @param totalTime - Total processing time in milliseconds
   * @param batchSize - Batch size used for processing
   * @param maxConcurrentBatches - Maximum concurrent batches used
   * @returns Formatted performance metrics
   */
  private calculatePerformanceMetrics(
    totalProcessed: number,
    totalTime: number,
    batchSize: number,
    maxConcurrentBatches: number
  ) {
    const recordsPerSecond = totalProcessed / (totalTime / 1000);
    const estimatedDailyCapacity = recordsPerSecond * 86400; // 24 hours in seconds

    ShortlistingLogger.logShortlisting(
      `Shortlisting evaluation completed in ${totalTime}ms. Processed: ${totalProcessed}, Shortlisted: ${totalProcessed}, Rejected: ${totalProcessed}, Failures: ${totalProcessed}. Performance: ${recordsPerSecond.toFixed(
        2
      )} records/sec. Estimated daily capacity: ${estimatedDailyCapacity.toLocaleString()} records`,
      'ShortlistingEvaluation'
    );

    return {
      totalProcessingTimeMs: totalTime,
      recordsPerSecond: parseFloat(recordsPerSecond.toFixed(2)),
      estimatedDailyCapacity: Math.round(estimatedDailyCapacity),
      batchSize,
      maxConcurrentBatches,
    };
  }

  /**
   * Main method for sending rejection email notifications
   * Processes all active cohorts with rejection notification dates matching today's date or earlier
   *
   * This method implements a high-performance, parallel processing system that can handle
   * 100,000+ records per cohort with optimized batching and concurrent processing.
   *
   * Process Flow:
   * 1. Fetch active cohorts with rejection notification date = today or earlier
   * 2. For each cohort, get rejected members who haven't received emails yet
   * 3. Process members in parallel batches for optimal performance
   * 4. Send personalized rejection email notifications
   * 5. Update rejection_email_sent flag to prevent duplicate emails
   * 6. Log failures for manual review
   *
   * Performance Features:
   * - Configurable batch size (default: 1000 records per batch)
   * - Parallel processing with configurable concurrency (default: 5 batches)
   * - Optimized database queries with batch fetching
   * - Real-time performance monitoring and metrics
   * - Graceful error handling with detailed failure logging
   * - Optional email notifications for performance optimization
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @param res - Express response object for API response
   * @returns Promise with processing results and performance metrics
   */
  public async sendRejectionEmailNotifications(
    tenantId: string,
    academicyearId: string,
    userId: string,
    res: Response
  ) {
    try {
      const result = await this.sendRejectionEmailNotificationsInternal(
        tenantId,
        academicyearId,
        userId
      );

      return APIResponse.success(
        res,
        APIID.COHORT_MEMBER_SEND_REJECTION_EMAILS,
        result,
        HttpStatus.OK,
        'Rejection email notifications completed successfully'
      );
    } catch (error) {
      return APIResponse.error(
        res,
        APIID.COHORT_MEMBER_SEND_REJECTION_EMAILS,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Internal method for sending rejection email notifications
   * Returns data directly without requiring a Response object
   * Used by both API endpoints and cron jobs
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @returns Promise with processing results and performance metrics
   */
  public async sendRejectionEmailNotificationsInternal(
    tenantId: string,
    academicyearId: string,
    userId: string
  ) {
    const apiId = APIID.COHORT_MEMBER_SEND_REJECTION_EMAILS;
    // Configurable performance parameters with environment variable fallbacks
    const batchSize = parseInt(process.env.BATCH_SIZE) || 5000;
    const maxConcurrentBatches =
      parseInt(process.env.MAX_CONCURRENT_BATCHES) || 10;
    const enableEmailNotifications =
      process.env.ENABLE_SHORTLISTING_EMAILS !== 'false';

    // Field ID for rejection notification date - should be configured based on your field structure
    const rejectionNotificationDateFieldId =
      process.env.REJECTION_NOTIFICATION_DATE_FIELD_ID;

    if (!rejectionNotificationDateFieldId) {
      throw new Error(
        'REJECTION_NOTIFICATION_DATE_FIELD_ID environment variable is required for rejection email notifications'
      );
    }

    const startTime = Date.now();

    try {
      ShortlistingLogger.logShortlisting(
        `Starting rejection email notifications with batch size: ${batchSize}, max concurrent batches: ${maxConcurrentBatches}`,
        'RejectionEmailNotification'
      );

      // Step 1: Process Active Cohorts with Rejection Notification Date
      const currentDateUTC = new Date().toISOString().split('T')[0]; // Use UTC date for timezone consistency
      const activeCohorts = await this.processActiveCohortsForRejectionEmails(
        tenantId,
        academicyearId,
        userId,
        rejectionNotificationDateFieldId,
        currentDateUTC
      );

      if (activeCohorts.length === 0) {
        ShortlistingLogger.logShortlisting(
          'No active cohorts found with rejection notification date today or earlier',
          'RejectionEmailNotification'
        );
        return [];
      }

      ShortlistingLogger.logShortlisting(
        `Found ${activeCohorts.length} active cohorts with rejection notification date today or earlier`,
        'RejectionEmailNotification'
      );

      // Step 2: Process Each Cohort for Rejection Emails
      const cohortResults = [];
      for (const cohort of activeCohorts) {
        const cohortResult = await this.processCohortForRejectionEmails(
          cohort,
          tenantId,
          batchSize,
          maxConcurrentBatches,
          apiId,
          userId
        );
        cohortResults.push(cohortResult);
      }

      // Step 3: Aggregate Results
      const aggregatedResults =
        this.aggregateRejectionEmailResults(cohortResults);

      // Step 4: Calculate Performance Metrics
      const totalTime = Date.now() - startTime;
      const performanceMetrics = this.calculatePerformanceMetrics(
        aggregatedResults.totalProcessed,
        totalTime,
        batchSize,
        maxConcurrentBatches
      );

      // Return comprehensive results with performance metrics
      return {
        ...aggregatedResults,
        ...performanceMetrics,
        message: 'Rejection email notifications completed successfully',
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;

      ShortlistingLogger.logShortlistingError(
        `Error in rejection email notifications after ${totalTime}ms`,
        error.message,
        'RejectionEmailNotification'
      );

      throw error;
    }
  }

  /**
   * Processes active cohorts for rejection email notifications
   * Handles the high-level flow of rejection email processing
   *
   * This method processes cohorts with rejection notification dates less than or equal to today's UTC date,
   * ensuring timezone consistency and recovery from missed cron executions.
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @param rejectionNotificationDateFieldId - The field ID for rejection notification date
   * @param currentDateUTC - Current UTC date in YYYY-MM-DD format
   * @returns Promise with active cohorts to process
   */
  private async processActiveCohortsForRejectionEmails(
    tenantId: string,
    academicyearId: string,
    userId: string,
    rejectionNotificationDateFieldId: string,
    currentDateUTC: string
  ) {
    // Step 1: Fetch Active Cohorts with Rejection Notification Date = Today or Earlier
    const activeCohorts =
      await this.getActiveCohortsWithRejectionNotificationDate(
        rejectionNotificationDateFieldId,
        currentDateUTC
      );

    if (activeCohorts.length === 0) {
      ShortlistingLogger.logShortlisting(
        'No active cohorts found with rejection notification date today or earlier',
        'RejectionEmailNotification'
      );
      return [];
    }

    ShortlistingLogger.logShortlisting(
      `Found ${activeCohorts.length} active cohorts with rejection notification date today or earlier`,
      'RejectionEmailNotification'
    );

    return activeCohorts;
  }

  /**
   * Fetches active cohorts that have a rejection notification date less than or equal to today's UTC date
   * Uses the configured rejection notification date field to identify cohorts for processing
   *
   * This method handles timezone consistency and missed cron executions by including
   * cohorts with rejection notification dates from previous days that may have been missed
   *
   * @param rejectionNotificationDateFieldId - The field ID for the rejection notification date field
   * @param currentDateUTC - Current UTC date in YYYY-MM-DD format
   * @returns Promise with array of active cohorts for processing
   */
  private async getActiveCohortsWithRejectionNotificationDate(
    rejectionNotificationDateFieldId: string,
    currentDateUTC: string
  ) {
    // Optimized query with better indexing and reduced data transfer
    const query = `
      SELECT DISTINCT 
        c."cohortId", 
        c."name", 
        c."status"
      FROM public."Cohort" c
      INNER JOIN public."FieldValues" fv ON c."cohortId" = fv."itemId"
      WHERE c."status" = 'active'
      AND fv."fieldId" = $1
      AND fv."calendarValue"::date <= $2::date
      AND fv."itemId" IS NOT NULL
      ORDER BY c."cohortId"
    `;

    const results = await this.cohortRepository.query(query, [
      rejectionNotificationDateFieldId,
      currentDateUTC,
    ]);

    return results;
  }

  /**
   * Processes a single cohort for rejection email notifications
   * Handles member processing, email sending, and result aggregation for one cohort
   *
   * @param cohort - The cohort to process
   * @param tenantId - The tenant ID for the evaluation context
   * @param batchSize - Number of records per batch
   * @param maxConcurrentBatches - Maximum number of batches to process concurrently
   * @param apiId - API ID for logging context
   * @param userId - The user ID for updates
   * @returns Promise with cohort processing results
   */
  private async processCohortForRejectionEmails(
    cohort: any,
    tenantId: string,
    batchSize: number,
    maxConcurrentBatches: number,
    apiId: string,
    userId: string
  ) {
    const processingStartTime = Date.now();
    const cohortId = cohort.cohortId;

    try {
      // Get rejected members that need email notifications
      const members = await this.getRejectedMembersForEmailNotification(
        cohortId
      );

      if (members.length === 0) {
        return {
          processed: 0,
          emailsSent: 0,
          failures: 0,
          processingTime: Date.now() - processingStartTime,
        };
      }

      // Process members in parallel batches
      const result = await this.processRejectionEmailBatchesInParallel(
        members,
        cohortId,
        batchSize,
        maxConcurrentBatches,
        apiId,
        userId
      );

      const processingTime = Date.now() - processingStartTime;

      return {
        ...result,
        processingTime,
      };
    } catch (error) {
      ShortlistingLogger.logShortlistingError(
        `Failed to process rejection emails for cohort ${cohortId}`,
        error.message,
        'RejectionEmailNotification'
      );

      return {
        processed: 0,
        emailsSent: 0,
        failures: 0,
        processingTime: Date.now() - processingStartTime,
      };
    }
  }

  /**
   * Fetches rejected cohort members who haven't received email notifications yet
   * These are the members that need to receive rejection email notifications
   *
   * @param cohortId - The cohort ID to fetch members for
   * @returns Promise with array of rejected cohort members
   */
  private async getRejectedMembersForEmailNotification(cohortId: string) {
    // Optimized query with proper indexing and LIMIT for batch processing
    const query = `
      SELECT 
        cm."cohortMembershipId",
        cm."cohortId",
        cm."userId",
        cm."status",
        cm."statusReason",
        cm."rejection_email_sent",
        cm."createdAt",
        cm."updatedAt"
      FROM public."CohortMembers" cm
      WHERE cm."cohortId" = $1 
      AND cm."status" = 'rejected'
      AND (cm."rejection_email_sent" IS NULL OR cm."rejection_email_sent" = false)
      ORDER BY cm."createdAt" ASC
      LIMIT $2
    `;

    const batchSize = parseInt(process.env.BATCH_SIZE) || 5000;
    const members = await this.cohortMembersRepository.query(query, [
      cohortId,
      batchSize,
    ]);

    return members;
  }

  /**
   * Processes rejection email batches in parallel for optimal performance
   * Implements controlled concurrency to balance performance with system resources
   *
   * This method:
   * 1. Divides members into batches of specified size
   * 2. Processes multiple batches concurrently (controlled by maxConcurrentBatches)
   * 3. Provides real-time progress updates
   * 4. Aggregates results from all batches
   *
   * Performance optimization:
   * - Pre-fetches user data for entire batches to reduce database calls
   * - Processes batches in parallel for I/O bound operations
   * - Provides progress logging for long-running operations
   * - Handles individual batch failures gracefully
   *
   * @param members - Array of rejected cohort members to process
   * @param cohortId - The cohort ID being processed
   * @param batchSize - Number of records per batch
   * @param maxConcurrentBatches - Maximum number of batches to process concurrently
   * @param apiId - API ID for logging context
   * @param userId - The user ID for updates
   * @returns Promise with aggregated processing results
   */
  private async processRejectionEmailBatchesInParallel(
    members: any[],
    cohortId: string,
    batchSize: number,
    maxConcurrentBatches: number,
    apiId: string,
    userId: string
  ) {
    let totalProcessed = 0;
    let totalEmailsSent = 0;
    let totalFailures = 0;

    // Create batches of specified size
    const batches = [];
    for (let i = 0; i < members.length; i += batchSize) {
      batches.push(members.slice(i, i + batchSize));
    }

    ShortlistingLogger.logShortlisting(
      `Processing ${batches.length} batches for rejection emails in cohort ${cohortId} with max ${maxConcurrentBatches} concurrent batches`,
      'RejectionEmailNotification'
    );

    // Process batches with controlled concurrency to avoid overwhelming the system
    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const currentBatches = batches.slice(i, i + maxConcurrentBatches);

      // Process current batch group in parallel
      const batchPromises = currentBatches.map((batch, batchIndex) =>
        this.processRejectionEmailBatch(
          batch,
          cohortId,
          apiId,
          i + batchIndex + 1,
          batches.length,
          userId
        )
      );

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results from all batches in this group
      batchResults.forEach((result, index) => {
        totalProcessed += result.processed;
        totalEmailsSent += result.emailsSent;
        totalFailures += result.failures;
      });

      // Log progress every 10 batch groups to provide visibility into long-running operations
      if ((i / maxConcurrentBatches + 1) % 10 === 0) {
        ShortlistingLogger.logShortlisting(
          `Cohort ${cohortId} rejection emails: Completed ${Math.min(
            i + maxConcurrentBatches,
            batches.length
          )}/${
            batches.length
          } batches. Progress: ${totalProcessed} records processed`,
          'RejectionEmailNotification'
        );
      }
    }

    return {
      processed: totalProcessed,
      emailsSent: totalEmailsSent,
      failures: totalFailures,
    };
  }

  /**
   * Processes a single batch of rejected cohort members for email notifications
   * Handles individual member email sending and status updates
   *
   * This method:
   * 1. Pre-fetches user data for all members in the batch (optimization)
   * 2. Sends personalized rejection email notifications
   * 3. Updates rejection_email_sent flag to prevent duplicate emails
   * 4. Logs failures for manual review
   * 5. Tracks performance metrics for monitoring
   *
   * Performance optimizations:
   * - Batch user data fetching reduces database calls
   * - Individual error handling prevents batch failures
   * - Performance monitoring for slow batches
   * - Detailed failure logging for troubleshooting
   *
   * @param members - Array of rejected cohort members in this batch
   * @param cohortId - The cohort ID being processed
   * @param apiId - API ID for logging context
   * @param batchNumber - Current batch number for logging
   * @param totalBatches - Total number of batches for progress tracking
   * @param userId - The user ID for updates
   * @returns Promise with batch processing results
   */
  private async processRejectionEmailBatch(
    members: any[],
    cohortId: string,
    apiId: string,
    batchNumber: number,
    totalBatches: number,
    userId: string
  ) {
    let processed = 0;
    let emailsSent = 0;
    let failures = 0;

    const batchStartTime = Date.now();

    // Pre-fetch all user data for this batch to reduce database calls
    const userIds = members.map((m) => m.userId);
    const userDataMap = new Map();

    if (userIds.length > 0) {
      const users = await this.usersRepository.find({
        where: { userId: In(userIds) },
        select: ['userId', 'email', 'firstName', 'lastName'],
      });

      users.forEach((user) => {
        userDataMap.set(user.userId, user);
      });
    }

    // Process each member in the batch

    for (const member of members) {
      try {
        // Get user data for this member
        const userData = userDataMap.get(member.userId);

        if (!userData?.email) {
          // Log failure for missing email
          ShortlistingLogger.logRejectionEmailFailure({
            dateTime: new Date().toISOString(),
            userId: member.userId,
            email: 'No email found',
            shortlistedStatus: 'rejected',
            failureReason: `No email found for user ${member.userId}`,
            cohortId: member.cohortId,
          });
          failures++;
          processed++; // Count as processed even if failed
          continue;
        }

        // Send rejection email notification
        await this.sendRejectionEmailNotification(
          member,
          userData,
          cohortId,
          userId
        );

        // Update rejection_email_sent flag
        await this.cohortMembersRepository.update(
          { cohortMembershipId: member.cohortMembershipId },
          { rejectionEmailSent: true }
        );

        // Update counters
        processed++;
        emailsSent++;
      } catch (error) {
        // Handle individual member failures gracefully
        failures++;
        processed++; // Count as processed even if failed

        ShortlistingLogger.logShortlistingError(
          `Failed to process rejection email for member ${member.userId} in batch ${batchNumber}/${totalBatches}`,
          error.message,
          'RejectionEmailNotification'
        );

        // Log failure to CSV for manual review and analysis
        ShortlistingLogger.logRejectionEmailFailure({
          dateTime: new Date().toISOString(),
          userId: member.userId,
          email: 'Unknown',
          shortlistedStatus: 'rejected',
          failureReason: error.message,
          cohortId: member.cohortId,
        });
      }
    }

    // Performance monitoring - log slow batches for optimization
    const batchTime = Date.now() - batchStartTime;

    if (batchTime > 5000) {
      // Log slow batches (>5 seconds)
      ShortlistingLogger.logShortlisting(
        `Slow rejection email batch detected: Batch ${batchNumber}/${totalBatches} took ${batchTime}ms for ${processed} records`,
        'RejectionEmailNotification',
        undefined,
        'warn'
      );
    }

    return { processed, emailsSent, failures };
  }

  /**
   * Sends a rejection email notification for a specific member
   * Handles email sending and logging for individual members
   *
   * @param member - The cohort member to send email to
   * @param userData - The user data for personalization
   * @param cohortId - The cohort ID for context
   * @param userId - The user ID for updates
   * @returns Promise that resolves when email is sent
   */
  private async sendRejectionEmailNotification(
    member: any,
    userData: any,
    cohortId: string,
    userId: string
  ) {
    // Get cohort data for email personalization
    const cohortData = await this.cohortRepository.findOne({
      where: { cohortId: cohortId },
    });

    const notificationPayload = {
      isQueue: false,
      context: 'USER',
      key: 'onStudentRejected', // Rejection template
      replacements: {
        '{username}': `${userData.firstName ?? ''} ${
          userData.lastName ?? ''
        }`.trim(),
        '{firstName}': userData.firstName ?? '',
        '{lastName}': userData.lastName ?? '',
        '{programName}': cohortData?.name ?? 'the program',
        '{status}': 'rejected',
        '{statusReason}': member.statusReason ?? 'Not specified',
      },
      email: {
        receipients: [userData.email],
      },
    };

    const mailSend = await this.notificationRequest.sendNotification(
      notificationPayload
    );

    if (mailSend?.result?.email?.errors?.length > 0) {
      // Log email failure
      ShortlistingLogger.logRejectionEmailFailure({
        dateTime: new Date().toISOString(),
        userId: userData.userId,
        email: userData.email,
        shortlistedStatus: 'rejected',
        failureReason: mailSend.result.email.errors.join(', '),
        cohortId: cohortId,
      });
      throw new Error(
        `Email sending failed: ${mailSend.result.email.errors.join(', ')}`
      );
    } else {
      // Log email success
      ShortlistingLogger.logRejectionEmailSuccess({
        dateTime: new Date().toISOString(),
        userId: userData.userId,
        email: userData.email,
        shortlistedStatus: 'rejected',
        cohortId: cohortId,
      });
    }
  }

  /**
   * Aggregates results from multiple cohort rejection email processing operations
   * Combines individual cohort results into overall performance metrics
   *
   * @param cohortResults - Array of results from individual cohort processing
   * @returns Aggregated results with total counts and processing time
   */
  private aggregateRejectionEmailResults(cohortResults: any[]) {
    let totalProcessed = 0;
    let totalEmailsSent = 0;
    let totalFailures = 0;
    let totalProcessingTime = 0;

    cohortResults.forEach((result) => {
      totalProcessed += result.processed;
      totalEmailsSent += result.emailsSent;
      totalFailures += result.failures;
      totalProcessingTime += result.processingTime;
    });

    return {
      totalProcessed,
      totalEmailsSent,
      totalFailures,
      totalProcessingTime,
    };
  }

  /**
   * Enrolls a shortlisted user to LMS courses for their cohort
   * Fetches all published courses for the cohort and enrolls the user
   *
   * @param userId - The user ID to enroll
   * @param cohortId - The cohort ID to get courses for
   * @returns Promise that resolves when enrollment is complete
   */
  private async enrollShortlistedUserToLMSCourses(
    userId: string,
    cohortId: string
  ) {
    try {
      const startTime = Date.now();

      // Log enrollment start
      ShortlistingLogger.logLMSEnrollmentStart({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
      });

      // Step 1: Fetch courses for the cohort
      const courses = await this.fetchLMSCoursesForCohort(cohortId);

      if (!courses || courses.length === 0) {
        ShortlistingLogger.logShortlisting(
          `No courses found for cohort ${cohortId}. Skipping LMS enrollment for user ${userId}`,
          'LMSEnrollment'
        );
        return;
      }
      // Update enrollment start log with course count
      ShortlistingLogger.logLMSEnrollmentStart({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseCount: courses.length,
      });

      // Step 2: Enroll user to all courses
      const enrollmentResults = await this.enrollUserToCourses(
        userId,
        courses,
        cohortId
      );

      // Log enrollment completion
      const processingTime = Date.now() - startTime;
      const successCount = enrollmentResults.filter(
        (r) => r.status === 'success'
      ).length;
      const failureCount = enrollmentResults.filter(
        (r) => r.status === 'failed'
      ).length;

      ShortlistingLogger.logLMSEnrollmentCompletion({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        totalCourses: courses.length,
        successfulEnrollments: successCount,
        failedEnrollments: failureCount,
        processingTime: processingTime,
      });
    } catch (error) {
      ShortlistingLogger.logShortlistingError(
        `Failed to enroll user ${userId} to LMS courses for cohort ${cohortId}`,
        error.message,
        'LMSEnrollment'
      );
      // Don't throw error to avoid breaking the shortlisting flow
    }
  }

  /**
   * Fetches LMS courses for a specific cohort
   * Makes API call to LMS service to get published courses
   *
   * @param cohortId - The cohort ID to fetch courses for
   * @returns Promise with array of courses or empty array if none found
   */
  private async fetchLMSCoursesForCohort(cohortId: string) {
    try {
      const lmsBaseUrl = process.env.LMS_SERVICE_URL;
      const tenantId = process.env.DEFAULT_TENANT_ID;
      const organisationId = process.env.DEFAULT_ORGANISATION_ID;

      if (!lmsBaseUrl || !tenantId || !organisationId) {
        throw new Error('LMS service configuration missing');
      }

      const requestUrl = `${lmsBaseUrl}/lms-service/v1/courses/search`;
      const requestParams = {
        status: 'published',
        cohortId: cohortId,
      };
      const requestHeaders = {
        tenantid: tenantId,
        organisationid: organisationId,
      };

      // Build the full URL with query parameters for logging
      const url = new URL(requestUrl);
      Object.keys(requestParams).forEach((key) => {
        url.searchParams.append(key, requestParams[key]);
      });
      const fullUrl = url.toString();

      const response = await axios.get(requestUrl, {
        params: requestParams,
        headers: requestHeaders,
      });

      // FIXED: Access the correct path for courses data
      const courses = response.data?.result?.courses || [];
      return courses;
    } catch (error) {
      ShortlistingLogger.logShortlistingError(
        `Failed to fetch LMS courses for cohort ${cohortId}`,
        error.message,
        'LMSEnrollment'
      );

      return [];
    }
  }

  /**
   * Enrolls a user to multiple courses
   * Uses for...of loop for proper async handling
   *
   * @param userId - The user ID to enroll
   * @param courses - Array of courses to enroll the user in
   * @returns Promise with enrollment results for each course
   */
  private async enrollUserToCourses(
    userId: string,
    courses: any[],
    cohortId: string
  ) {
    const enrollmentResults = [];

    // Use for...of loop for proper async handling
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];

      try {
        const enrollmentResult = await this.enrollUserToSingleCourse(
          userId,
          course.courseId,
          cohortId
        );

        enrollmentResults.push({
          courseId: course.courseId,
          status: 'success',
          result: enrollmentResult,
        });
      } catch (error) {
        enrollmentResults.push({
          courseId: course.courseId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return enrollmentResults;
  }

  /**
   * Enrolls a user to a single course
   * Makes API call to LMS service to create enrollment
   *
   * @param userId - The user ID to enroll
   * @param courseId - The course ID to enroll in
   * @returns Promise with enrollment result
   */
  private async enrollUserToSingleCourse(
    userId: string,
    courseId: string,
    cohortId: string
  ) {
    const lmsBaseUrl = process.env.LMS_SERVICE_URL;
    const tenantId = process.env.DEFAULT_TENANT_ID;
    const organisationId = process.env.DEFAULT_ORGANISATION_ID;

    try {
      const requestUrl = `${lmsBaseUrl}/lms-service/v1/enrollments`;

      const requestBody = {
        courseId: courseId,
        learnerId: userId,
        status: 'published',
      };
      const requestHeaders = {
        tenantid: tenantId,
        organisationid: organisationId,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(requestUrl, requestBody, {
        headers: requestHeaders,
        params: {
          userId: userId, // Add userId as query parameter as required by LMS service
        },
      });

      // Log successful enrollment
      ShortlistingLogger.logLMSEnrollmentSuccess({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseId: courseId,
        enrollmentId: response.data?.enrollmentId || response.data?.id,
      });

      return response.data;
    } catch (error) {
      // Log failed enrollment
      ShortlistingLogger.logLMSEnrollmentFailure({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseId: courseId,
        failureReason: error.message,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
      });

      throw error;
    }
  }

  /**
   * De-enrolls a rejected user from LMS courses for their cohort
   * Fetches all published courses for the cohort and de-enrolls the user
   *
   * @param userId - The user ID to de-enroll
   * @param cohortId - The cohort ID to get courses for
   * @returns Promise that resolves when de-enrollment is complete
   */
  private async deenrollRejectedUserFromLMSCourses(
    userId: string,
    cohortId: string
  ) {
    try {
      const startTime = Date.now();

      // Log de-enrollment start
      ShortlistingLogger.logLMSDeenrollmentStart({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
      });

      // Step 1: Fetch courses for the cohort
      const courses = await this.fetchLMSCoursesForCohort(cohortId);

      if (!courses || courses.length === 0) {
        ShortlistingLogger.logShortlisting(
          `No courses found for cohort ${cohortId}. Skipping de-enrollment.`,
          'LMSDeenrollment'
        );
        return;
      }

      // Step 2: De-enroll user from each course
      const deenrollmentResults = await this.deenrollUserFromCourses(
        userId,
        courses,
        cohortId
      );

      // Step 3: Log completion
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      const successCount = deenrollmentResults.filter(
        (result) => result.status === 'success'
      ).length;
      const failureCount = deenrollmentResults.filter(
        (result) => result.status === 'error'
      ).length;

      ShortlistingLogger.logLMSDeenrollmentCompletion({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        totalCourses: courses.length,
        successfulDeenrollments: successCount,
        failedDeenrollments: failureCount,
        processingTime: processingTime,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * De-enrolls a user from multiple courses
   * Uses for...of loop for proper async handling
   *
   * @param userId - The user ID to de-enroll
   * @param courses - Array of courses to de-enroll the user from
   * @param cohortId - The cohort ID for logging purposes
   * @returns Promise with de-enrollment results for each course
   */
  private async deenrollUserFromCourses(
    userId: string,
    courses: any[],
    cohortId: string
  ) {
    const deenrollmentResults = [];

    // Use for...of loop for proper async handling
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];

      try {
        const deenrollmentResult = await this.deenrollUserFromSingleCourse(
          userId,
          course.courseId,
          cohortId
        );

        deenrollmentResults.push({
          courseId: course.courseId,
          status: 'success',
          result: deenrollmentResult,
        });
      } catch (error) {
        deenrollmentResults.push({
          courseId: course.courseId,
          status: 'error',
          error: error.message,
        });

        // Log the error but continue with other courses
        ShortlistingLogger.logShortlistingError(
          `Failed to de-enroll user ${userId} from course ${course.courseId} in cohort ${cohortId}`,
          error.message,
          'LMSDeenrollment'
        );
      }
    }

    return deenrollmentResults;
  }

  /**
   * De-enrolls a user from a single course
   * Makes API call to LMS service to delete enrollment
   *
   * @param userId - The user ID to de-enroll
   * @param courseId - The course ID to de-enroll from
   * @param cohortId - The cohort ID for logging purposes
   * @returns Promise with de-enrollment result
   */
  private async deenrollUserFromSingleCourse(
    userId: string,
    courseId: string,
    cohortId: string
  ) {
    const lmsBaseUrl = process.env.LMS_SERVICE_URL;
    const tenantId = process.env.DEFAULT_TENANT_ID;
    const organisationId = process.env.DEFAULT_ORGANISATION_ID;

    try {
      const requestUrl = `${lmsBaseUrl}/lms-service/v1/enrollments`;
      const requestBody = {
        courseId: courseId,
        userId: userId,
      };
      const requestHeaders = {
        tenantid: tenantId,
        organisationid: organisationId,
        'Content-Type': 'application/json',
      };

      const response = await axios.delete(requestUrl, {
        headers: requestHeaders,
        data: requestBody,
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Builds WHERE clause for searchtext filtering across multiple columns
   * @param searchtext - The search text to filter by
   * @returns SQL WHERE clause string for searchtext filtering
   */
  private buildSearchTextWhereClause(searchtext: string): string {
    try {
      if (
        !searchtext ||
        typeof searchtext !== 'string' ||
        searchtext.trim().length < 2
      ) {
        return '';
      }

      // Split searchtext by spaces and process all words
      const searchTerms = searchtext
        .trim()
        .split(/\s+/)
        .filter((term) => term && term.length > 0);

      if (searchTerms.length === 0) {
        return '';
      }

      // Build ILIKE conditions for each search term with smart column prioritization
      const searchConditions = searchTerms
        .map((term) => {
          if (!term || typeof term !== 'string') {
            return '';
          }

          const escapedTerm = term.replace(/%/g, '\\%').replace(/_/g, '\\_');

          // Check if this looks like an email
          const isEmail = term.includes('@');

          if (isEmail) {
            // For email-like terms, prioritize email and username columns only
            return `(
            U."email" ILIKE '%${escapedTerm}%' OR
            U."username" ILIKE '%${escapedTerm}%'
          )`;
          } else {
            // For non-email terms, search across all columns
            return `(
            U."username" ILIKE '%${escapedTerm}%' OR
            U."email" ILIKE '%${escapedTerm}%' OR
            U."firstName" ILIKE '%${escapedTerm}%' OR
            U."middleName" ILIKE '%${escapedTerm}%' OR
            U."lastName" ILIKE '%${escapedTerm}%'
          )`;
          }
        })
        .filter((condition) => condition !== ''); // Filter out empty conditions

      if (searchConditions.length === 0) {
        return '';
      }

      // All terms must be found (AND logic between terms)
      return `AND (${searchConditions.join(' AND ')})`;
    } catch (error) {
      console.error('Error in buildSearchTextWhereClause:', error);
      return '';
    }
  }
}
