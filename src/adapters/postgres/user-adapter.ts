import { HttpStatus, Injectable, Query } from '@nestjs/common';
import { User } from '../../user/entities/user-entity'
import { FieldValues } from 'src/fields/entities/fields-values.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserCreateDto } from '../../user/dto/user-create.dto';
import jwt_decode from "jwt-decode";
import {
  getKeycloakAdminToken,
  createUserInKeyCloak,
  checkIfUsernameExistsInKeycloak,
  checkIfEmailExistsInKeycloak
} from "../../common/utils/keycloak.adapter.util"
import { ErrorResponse } from 'src/error-response';
import { SuccessResponse } from 'src/success-response';
import { Fields } from 'src/fields/entities/fields.entity';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
import { isUUID } from 'class-validator';
import { UserSearchDto } from 'src/user/dto/user-search.dto';
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UserData } from 'src/user/user.controller';
import APIResponse from 'src/common/responses/response';
import { Response, query } from 'express';
import { APIID } from 'src/common/utils/api-id.config';
import { IServicelocator } from '../userservicelocator';
import { PostgresFieldsService } from "./fields-adapter"
import { PostgresRoleService } from './rbac/role-adapter';
import { CustomFieldsValidation } from '@utils/custom-field-validation';
import { NotificationRequest } from '@utils/notification.axios';


@Injectable()
export class PostgresUserService implements IServicelocator {
  axios = require("axios");

  constructor(
    // private axiosInstance: AxiosInstance,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(FieldValues)
    private fieldsValueRepository: Repository<FieldValues>,
    @InjectRepository(CohortMembers)
    private cohortMemberRepository: Repository<CohortMembers>,
    @InjectRepository(UserTenantMapping)
    private userTenantMappingRepository: Repository<UserTenantMapping>,
    @InjectRepository(Tenants)
    private tenantsRepository: Repository<Tenants>,
    @InjectRepository(UserRoleMapping)
    private userRoleMappingRepository: Repository<UserRoleMapping>,
    @InjectRepository(Cohort)
    private cohortRepository: Repository<Cohort>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private fieldsService: PostgresFieldsService,
    private readonly postgresRoleService: PostgresRoleService,
    private readonly notificationRequest: NotificationRequest
    // private cohortMemberService: PostgresCohortMembersService,
  ) { }

  async searchUser(tenantId: string,
    request: any,
    response: any,
    userSearchDto: UserSearchDto) {
    const apiId = APIID.USER_LIST;
    try {
      let findData = await this.findAllUserDetails(userSearchDto);

      if (findData === false) {
        return APIResponse.error(response, apiId, "No Data Found", "Not Found", HttpStatus.NOT_FOUND);
      }

      return await APIResponse.success(response, apiId, findData,
        HttpStatus.OK, 'User List fetched.')
    } catch (e) {
      const errorMessage = e.message || "Internal server error";
      return APIResponse.error(response, apiId, "Internal Server Error", errorMessage, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }


  async findAllUserDetails(userSearchDto) {

    let { limit, offset, filters, exclude, sort } = userSearchDto;
    let excludeCohortIdes;
    let excludeUserIdes;

    offset = offset ? `OFFSET ${offset}` : '';
    limit = limit ? `LIMIT ${limit}` : ''
    let result = {
      totalCount: 0,
      getUserDetails: []
    };

    let whereCondition = `WHERE`;
    let index = 0;
    const searchCustomFields: any = {};

    const userAllKeys = this.usersRepository.metadata.columns.map(
      (column) => column.propertyName,
    );
    const userKeys = userAllKeys.filter(key => key !== 'district' && key !== 'state');


    if (filters && Object.keys(filters).length > 0) {
      for (const [key, value] of Object.entries(filters)) {
        if (index > 0) {
          whereCondition += ` AND `
        }
        if (userKeys.includes(key)) {
          if (key === 'name') {
            whereCondition += ` U."${key}" ILIKE '%${value}%'`;
          }
          else {
            if (key === 'status') {
              if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
                const status = value.map(item => `'${item.trim().toLowerCase()}'`).join(',');
                whereCondition += ` U."${key}" IN(${status})`;
              }
            } else {
              whereCondition += ` U."${key}" = '${value}'`;
            }
          }
          index++;
        } else {
          if (key == 'role') {
            whereCondition += ` R."name" = '${value}'`
            index++;
          } else {
            searchCustomFields[key] = value;
          }
        }
      };
    }

    if (exclude && Object.keys(exclude).length > 0) {
      Object.entries(exclude).forEach(([key, value]) => {
        if (key == 'cohortIds') {
          excludeCohortIdes = (value);
        }
        if (key == 'userIds') {
          excludeUserIdes = (value);
        }
      });
    }

    let orderingCondition = '';
    if (sort && Object.keys(sort).length > 0) {
      orderingCondition = `ORDER BY U."${sort[0]}" ${sort[1]}`;
    }

    let getUserIdUsingCustomFields;

    //If source config in source details from fields table is not exist then return false 
    if (Object.keys(searchCustomFields).length > 0) {
      let context = 'USERS'
      getUserIdUsingCustomFields = await this.fieldsService.filterUserUsingCustomFields(context, searchCustomFields);

      if (getUserIdUsingCustomFields == null) {
        return false;
      }
    }

    if (getUserIdUsingCustomFields && getUserIdUsingCustomFields.length > 0) {
      const userIdsDependsOnCustomFields = getUserIdUsingCustomFields.map(userId => `'${userId}'`).join(',');
      whereCondition += `${index > 0 ? ' AND ' : ''} U."userId" IN (${userIdsDependsOnCustomFields})`;
      index++;
    }

    const userIds = excludeUserIdes?.length > 0 ? excludeUserIdes.map(userId => `'${userId}'`).join(',') : null;

    const cohortIds = excludeCohortIdes?.length > 0 ? excludeCohortIdes.map(cohortId => `'${cohortId}'`).join(',') : null;

    if (userIds || cohortIds) {
      const userCondition = userIds ? `U."userId" NOT IN (${userIds})` : '';
      const cohortCondition = cohortIds ? `CM."cohortId" NOT IN (${cohortIds})` : '';
      const combinedCondition = [userCondition, cohortCondition].filter(String).join(' AND ');
      whereCondition += (index > 0 ? ' AND ' : '') + combinedCondition;
    } else if (index === 0) {
      whereCondition = '';
    }

    //Get user core fields data
    let query = `SELECT U."userId", U."username", U."name", R."name" AS role, U."mobile", U."createdBy",U."updatedBy", U."createdAt", U."updatedAt", U.status, COUNT(*) OVER() AS total_count 
      FROM  public."Users" U
      LEFT JOIN public."CohortMembers" CM 
      ON CM."userId" = U."userId"
      LEFT JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      LEFT JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCondition} GROUP BY U."userId", R."name" ${orderingCondition} ${offset} ${limit}`
    let userDetails = await this.usersRepository.query(query);

    if (userDetails.length > 0) {
      result.totalCount = parseInt(userDetails[0].total_count, 10);

      //Get user custom field data
      for (let userData of userDetails) {
        let customFields = await this.fieldsService.getUserCustomFieldDetails(userData.userId);
        userData['customFields'] = customFields.map(data => ({
          fieldId: data?.fieldId,
          label: data?.label,
          value: data?.value,
          code: data?.code,
          type: data?.type,
        }));
        result.getUserDetails.push(userData);
      }
    } else {
      return false;
    }
    return result;
  }

  async getUsersDetailsById(userData: UserData, response: any) {
    const apiId = APIID.USER_GET;
    try {

      if (!isUUID(userData.userId)) {
        return APIResponse.error(response, apiId, "Bad request", `Please Enter Valid  UUID`, HttpStatus.BAD_REQUEST);
      }
      const checkExistUser = await this.usersRepository.find({
        where: {
          userId: userData.userId
        }
      })

      if (checkExistUser.length == 0) {
        return APIResponse.error(response, apiId, "Not Found", `User Id '${userData.userId}' does not exist.`, HttpStatus.NOT_FOUND);
      }

      const result = {
        userData: {}
      };

      let [userDetails, userRole] = await Promise.all([
        this.findUserDetails(userData?.userId),
        userData && userData?.tenantId ? this.findUserRoles(userData?.userId, userData?.tenantId) : Promise.resolve(null)
      ]);

      let roleInUpper;
      if (userRole) {
        roleInUpper = userRole ? userRole.title.toUpperCase() : null;
        userDetails['role'] = userRole.title;
      }


      if (!userDetails) {
        return APIResponse.error(response, apiId, "Not Found", `User Not Found`, HttpStatus.NOT_FOUND);
      }
      if (!userData.fieldValue) {
        return await APIResponse.success(response, apiId, { userData: userDetails },
          HttpStatus.OK, 'User details Fetched Successfully.')
      }

      let customFields;

      if (userData && userData?.fieldValue) {
        let context = 'USERS';
        let contextType = roleInUpper;
        // customFields = await this.fieldsService.getFieldValuesData(userData.userId, context, contextType, ['All'], true);
        customFields = await this.fieldsService.getUserCustomFieldDetails(userData.userId)
      }

      result.userData = userDetails;

      result.userData['customFields'] = customFields;
      return await APIResponse.success(response, apiId, { ...result },
        HttpStatus.OK, 'User details Fetched Successfully.')
    } catch (e) {
      return APIResponse.error(response, apiId, "Internal Server Error", "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async findUserName(cohortId: string, role: string) {
    let query = `SELECT U."userId", U.username, U.name, U.role, U.mobile FROM public."CohortMembers" CM   
    LEFT JOIN public."Users" U 
    ON CM."userId" = U."userId"
    where CM."cohortId" =$1 `
    if (role !== null) {
      query += ` AND U."role" = $2`;
    }
    let result: any[];
    if (role !== null) {
      result = await this.usersRepository.query(query, [cohortId, role]);
    } else {
      result = await this.usersRepository.query(query, [cohortId]);
    }
    return result;
  }

  async findUserRoles(userId: string, tenantId: string) {

    const getRole = await this.userRoleMappingRepository.findOne({
      where: {
        userId: userId,
        tenantId: tenantId
      }
    })
    if (!getRole) {
      return false;
    }
    let role;
    role = await this.roleRepository.findOne({
      where: {
        roleId: getRole.roleId,
      },
      select: ["title", 'code']
    })
    return role;
  }

  async findUserDetails(userId, username?: any, tenantId?: string
  ) {
    let whereClause: any = { userId: userId };
    if (username && userId === null) {
      delete whereClause.userId;
      whereClause.username = username;
    }
    let userDetails = await this.usersRepository.findOne({
      where: whereClause,
      select: ["userId", "username", "name", "mobile", "email"]
    })
    if (!userDetails) {
      return false;
    }
    const tenentDetails = await this.userTenantRoleData(userDetails.userId);
    if (!tenentDetails) {
      return userDetails;
    }
    const tenantData = tenantId ? tenentDetails.filter(item => item.tenantId === tenantId) : tenentDetails;
    userDetails['tenantData'] = tenantData;

    return userDetails;
  }

  async userTenantRoleData(userId: string) {
    const query = `
  SELECT 
    DISTINCT ON (T."tenantId") 
    T."tenantId", 
    T.name AS tenantName, 
    UTM."Id" AS userTenantMappingId
  FROM 
    public."UserTenantMapping" UTM
  LEFT JOIN 
    public."Tenants" T 
  ON 
    T."tenantId" = UTM."tenantId" 
  WHERE 
    UTM."userId" = $1
  ORDER BY 
    T."tenantId", UTM."Id";`;

    const result = await this.usersRepository.query(query, [userId]);
    const combinedResult = [];
    let roleArray = []
    for (let data of result) {
      const roleData = await this.postgresRoleService.findUserRoleData(userId, data.tenantId);
      if (roleData.length > 0) {
        roleArray.push(roleData[0].roleid)
        const roleId = roleData[0].roleid;
        const roleName = roleData[0].title;

        const privilegeData = await this.postgresRoleService.findPrivilegeByRoleId(roleArray);
        const privileges = privilegeData.map(priv => priv.name);

        combinedResult.push({
          tenantName: data.tenantname,
          tenantId: data.tenantId,
          userTenantMappingId: data.usertenantmappingid,
          roleId: roleId,
          roleName: roleName,
          privileges: privileges
        });
      }
    }

    return combinedResult;
  }

  async updateUser(userDto, response: Response) {
    const apiId = APIID.USER_UPDATE;
    try {
      let updatedData = {};
      let editIssues = {};

      if (userDto.userData) {
        await this.updateBasicUserDetails(userDto.userId, userDto.userData);
        updatedData['basicDetails'] = userDto.userData;
      }

      if (userDto?.customFields?.length > 0) {
        const getFieldsAttributes = await this.fieldsService.getEditableFieldsAttributes();

        let isEditableFieldId = [];
        const fieldIdAndAttributes = {};
        for (let fieldDetails of getFieldsAttributes) {
          isEditableFieldId.push(fieldDetails.fieldId);
          fieldIdAndAttributes[`${fieldDetails.fieldId}`] = fieldDetails;
        }

        let unEditableIdes = [];
        let editFailures = [];
        for (let data of userDto.customFields) {
          if (isEditableFieldId.includes(data.fieldId)) {
            const result = await this.fieldsService.updateCustomFields(userDto.userId, data, fieldIdAndAttributes[data.fieldId]);
            if (result.correctValue) {
              if (!updatedData['customFields'])
                updatedData['customFields'] = [];
              updatedData['customFields'].push(result);
            } else {
              editFailures.push(`${data.fieldId}: ${result?.valueIssue} - ${result.fieldName}`)
            }
          } else {
            unEditableIdes.push(data.fieldId)
          }
        }
        if (unEditableIdes.length > 0) {
          editIssues["uneditableFields"] = unEditableIdes
        }
        if (editFailures.length > 0) {
          editIssues["editFieldsFailure"] = editFailures
        }
      }
      return await APIResponse.success(response, apiId, { ...updatedData, editIssues },
        HttpStatus.OK, "User has been updated successfully.")
    } catch (e) {
      return APIResponse.error(response, apiId, "Internal Server Error", "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateBasicUserDetails(userId, userData: Partial<User>): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { userId: userId } });
    if (!user) {
      return null;
    }
    Object.assign(user, userData);

    return this.usersRepository.save(user);
  }

  async createUser(request: any, userCreateDto: UserCreateDto, response: Response) {

    const apiId = APIID.USER_CREATE;
    // It is considered that if user is not present in keycloak it is not present in database as well
    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      userCreateDto.createdBy = decoded?.sub
      userCreateDto.updatedBy = decoded?.sub
      // const emailId = decoded?.email;


      let email = await this.usersRepository.findOne({
        where: { userId: userCreateDto.createdBy }, select
          : ['email']
      })

      let customFieldError;
      if (userCreateDto.customFields && userCreateDto.customFields.length > 0) {
        customFieldError = await this.validateCustomField(userCreateDto, response, apiId);
        if (customFieldError) {
          return APIResponse.error(response, apiId, "BAD_REQUEST", `${customFieldError}`, HttpStatus.BAD_REQUEST);
        }
      }



      // check and validate all fields
      let validatedRoles = await this.validateRequestBody(userCreateDto)

      if (validatedRoles) {
        return APIResponse.error(response, apiId, "BAD_REQUEST", `${validatedRoles}`, HttpStatus.BAD_REQUEST);
      }

      const getUsernameAndPassword = await this.generateUserNamePassword(userCreateDto);

      userCreateDto.username = userCreateDto.username ? await this.formatUsername(userCreateDto.username) : getUsernameAndPassword['username'];

      userCreateDto.password = userCreateDto.password ? userCreateDto.password : getUsernameAndPassword['password'];

      const userSchema = new UserCreateDto(userCreateDto);

      let errKeycloak = "";
      let resKeycloak = "";
      console.log("userCreateDto", userCreateDto);
      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;
      let checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(userCreateDto)
      // let checkUserinDb = await this.checkUserinKeyCloakandDb(userCreateDto.username);
      console.log(checkUserinKeyCloakandDb);

      if (checkUserinKeyCloakandDb) {
        return APIResponse.error(response, apiId, "Forbidden", `User Already Exist`, HttpStatus.FORBIDDEN);
      }
      resKeycloak = await createUserInKeyCloak(userSchema, token).catch(
        (error) => {
          errKeycloak = error.response?.data.errorMessage;
          return APIResponse.error(response, apiId, "Internal Server Error", `${errKeycloak}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      );

      userCreateDto.userId = resKeycloak;

      let result = await this.createUserInDatabase(request, userCreateDto, response);

      const createFailures = [];
      if (result && userCreateDto.customFields && userCreateDto.customFields.length > 0) {

        let userId = result?.userId;
        let roles;

        if (validatedRoles) {
          roles = validatedRoles?.map(({ code }) => code?.toUpperCase())
        }

        const customFields = await this.fieldsService.findCustomFields("USERS", roles)

        if (customFields) {
          const customFieldAttributes = customFields.reduce((fieldDetail, { fieldId, fieldAttributes, fieldParams, name }) => fieldDetail[`${fieldId}`] ? fieldDetail : { ...fieldDetail, [`${fieldId}`]: { fieldAttributes, fieldParams, name } }, {});


          for (let fieldValues of userCreateDto.customFields) {
            const fieldData = {
              fieldId: fieldValues['fieldId'],
              value: fieldValues['value']
            }

            let res = await this.fieldsService.updateCustomFields(userId, fieldData, customFieldAttributes[fieldData.fieldId]);

            if (res.correctValue) {
              if (!result['customFields'])
                result['customFields'] = [];
              result["customFields"].push(res);
            } else {
              createFailures.push(`${fieldData.fieldId}: ${res?.valueIssue} - ${res.fieldName}`)
            }
          }
        }
      }

      // Send Notification if user added as cohort Member
      if (result && userCreateDto?.tenantCohortRoleMapping && userCreateDto?.tenantCohortRoleMapping[0]?.cohortId && userCreateDto?.tenantCohortRoleMapping[0]?.cohortId.length > 0 && email && email.email) {

        const notificationPayload = {
          isQueue: false,
          context: 'USER',
          replacements: [userCreateDto.name, userCreateDto.username, userCreateDto.password],
          email: {
            receipients: [email.email]
          }
        };
        await this.notificationRequest.sendNotification(notificationPayload);
      }

      APIResponse.success(response, apiId, { userData: { ...result, createFailures } },
        HttpStatus.CREATED, "User has been created successfully.")
      // }
    } catch (e) {
      const errorMessage = e?.message || 'Something went wrong';
      return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }


  async validateRequestBody(userCreateDto) {
    const roleData = [];
    let duplicateTenet = [];

    let error = [];
    for (const [key, value] of Object.entries(userCreateDto)) {
      if (key === 'email') {
        const checkValidEmail = CustomFieldsValidation.validate('email', userCreateDto.email);
        if (!checkValidEmail) {
          error.push(`Invalid email address`);
        }
      }

      if (key === 'mobile') {
        const checkValidMobile = CustomFieldsValidation.validate('mobile', userCreateDto.mobile);
        if (!checkValidMobile) {
          error.push(`Mobile number must be 10 digits long`);
        }
      }

      if (key === 'dob') {
        const checkValidDob = CustomFieldsValidation.validate('date', userCreateDto.dob);
        if (!checkValidDob) {
          error.push(`Date of birth must be in the format yyyy-mm-dd`);
        }
      }
    }


    if (userCreateDto.tenantCohortRoleMapping) {
      for (const tenantCohortRoleMapping of userCreateDto?.tenantCohortRoleMapping) {

        const { tenantId, cohortId, roleId } = tenantCohortRoleMapping;

        if (duplicateTenet.includes(tenantId)) {
          error.push("Duplicate tenantId detected. Please ensure each tenantId is unique and correct your data.");
        }

        if ((tenantId && !roleId) || (!tenantId && roleId)) {
          error.push("Invalid parameters provided. Please ensure that tenantId, roleId, and cohortId (if applicable) are correctly provided.");
        }

        const [tenantExists, cohortExists, roleExists] = await Promise.all([
          tenantId ? this.tenantsRepository.find({ where: { tenantId } }) : Promise.resolve(null),
          tenantId && cohortId ? this.checkCohort(tenantId, cohortId) : Promise.resolve(null),
          roleId ? this.roleRepository.find({ where: { roleId, tenantId } }) : Promise.resolve(null)
        ]);

        if (tenantExists.length === 0) {
          error.push(`Tenant Id '${tenantId}' does not exist.`);
        }

        if (cohortExists) {
          error.push(`Cohort Id '${cohortExists}' does not exist for this tenant '${tenantId}'.`);
        }

        if (roleExists && roleExists?.length === 0) {
          error.push(`Role Id '${roleId}' does not exist for this tenant '${tenantId}'.`);
        }
      }
      if (error.length > 0) {
        return error;
      }
    } else {
      return false;
    }

  }

  async checkCohort(tenantId: any, cohortData: any) {
    let notExistCohort = [];
    for (let cohortId of cohortData) {
      let findCohortData = await this.cohortRepository.findOne({ where: { tenantId, cohortId } })

      if (!findCohortData) {
        notExistCohort.push(cohortId)
      }
    }

    if (notExistCohort.length > 0) {
      return notExistCohort
    }
  }
  async checkUser(body) {
    let checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(body);
    if (checkUserinKeyCloakandDb) {
      return new SuccessResponse({
        statusCode: 200,
        message: "User Exists. Proceed with Sending Email ",
        data: { data: true },
      });
    }
    return new SuccessResponse({
      statusCode: HttpStatus.BAD_REQUEST,
      message: "Invalid Username Or Email",
      data: { data: false },
    });
  }

  // Can be Implemeneted after we know what are the unique entties
  async checkUserinKeyCloakandDb(userDto) {
    const keycloakResponse = await getKeycloakAdminToken();
    const token = keycloakResponse.data.access_token;
    if (userDto?.username) {
      const usernameExistsInKeycloak = await checkIfUsernameExistsInKeycloak(
        userDto?.username,
        token
      );
      if (usernameExistsInKeycloak?.data?.length > 0) {
        return usernameExistsInKeycloak;
      }
      return false;
    } else {
      const usernameExistsInKeycloak = await checkIfEmailExistsInKeycloak(
        userDto?.email,
        token
      );
      if (usernameExistsInKeycloak.data.length > 0) {
        return usernameExistsInKeycloak;
      }
      return false;
    }
  }

  async generateUserNamePassword(userCreateDto: UserCreateDto) {
    try {
      let tenantCohortRoleMap = userCreateDto ? userCreateDto.tenantCohortRoleMapping : [];
      let userRole;
      let userTenant;
      for (const tenantCohortRole of tenantCohortRoleMap) {
        if (tenantCohortRole.roleId) {
          let getRoleName = await this.roleRepository.find({
            where: { "roleId": tenantCohortRole?.roleId },
            select: ["title"]
          })

          let getTenantName = await this.tenantsRepository.find({
            where: { "tenantId": tenantCohortRole?.tenantId },
            select: ["name"]
          })
          userRole = getRoleName.map(role => role?.title.toUpperCase()).join(', ')
          userTenant = getTenantName.map(role => role?.name).join(', ')
        }
      }

      let generatedUsername;
      let generatePassword;

      // Generate the username based on the role and the program
      if (userRole && userRole === 'STUDENT') {
        let fieldValues = userCreateDto ? userCreateDto?.customFields : [];
        let suffix;
        if (fieldValues) {
          for (const fieldsData of fieldValues) {
            let getFieldName = await this.fieldsService.getFieldByIdes(fieldsData?.fieldId);
            if (getFieldName['name'] === 'program') {
              suffix = fieldsData?.value
            }
          }
        }

        // Retrieve the maximum sequence number from existing usernames
        const maxUsername = await this.usersRepository
          .createQueryBuilder('user')
          .select("MAX(CAST(REGEXP_REPLACE(user.username, '[^0-9]', '', 'g') AS INTEGER))", 'max')
          .where("user.username ILIKE :usernamePattern", { usernamePattern: `${userTenant}%` })
          .andWhere("REGEXP_REPLACE(user.username, '[^0-9]', '', 'g') <> ''")
          .getRawOne();

        const maxNumber = maxUsername?.max;
        const newSequenceNumber = maxNumber + 1;

        generatedUsername = `${userTenant}${newSequenceNumber}${suffix?.[0]?.toUpperCase() || ''}`;
        generatePassword = `${generatedUsername}@${userTenant.toLowerCase() || ''}`
      }


      if (userRole && userRole === 'TEACHER') {
        generatedUsername = await this.formatUsername(userCreateDto?.name);
        generatePassword = `${generatedUsername}@${userTenant.toLowerCase() || ''}`
      }

      let loginCredintial = {
        "username": generatedUsername,
        "password": generatePassword
      };
      return loginCredintial;

    } catch (error) {
      return false;
    }
  }

  async formatUsername(name: string) {
    console.log("hii");

    // Remove prefixes (Dr., Mr., Mrs., etc.)
    const nameWithoutPrefix = name.replace(/^(Dr\.|Mr\.|Mrs\.)\s+/i, '');

    // Split the name by space
    const nameParts = nameWithoutPrefix.split(' ');

    // Convert the name to lowercase and join with an underscore
    const formattedName = nameParts.map(part => part.toLocaleLowerCase()).join('_');

    return formattedName;
  }

  async createUserInDatabase(request: any, userCreateDto: UserCreateDto, response: Response) {

    const user = new User()
    user.username = userCreateDto?.username
    user.name = userCreateDto?.name
    user.email = userCreateDto?.email
    user.mobile = Number(userCreateDto?.mobile) || null,
      user.createdBy = userCreateDto?.createdBy
    user.updatedBy = userCreateDto?.updatedBy
    user.userId = userCreateDto?.userId,
      user.state = userCreateDto?.state,
      user.district = userCreateDto?.district,
      user.address = userCreateDto?.address,
      user.pincode = userCreateDto?.pincode

    if (userCreateDto?.dob) {
      user.dob = new Date(userCreateDto.dob);
    }
    let result = await this.usersRepository.save(user);



    if (result && userCreateDto.tenantCohortRoleMapping) {
      for (let mapData of userCreateDto.tenantCohortRoleMapping) {
        if (mapData.cohortId) {
          for (let cohortIds of mapData.cohortId) {
            let cohortData = {
              userId: result?.userId,
              cohortId: cohortIds
            }
            await this.addCohortMember(cohortData);
          }
        }

        let tenantRoleMappingData = {
          userId: result?.userId,
          tenantRoleMapping: mapData,
        }
        await this.assignUserToTenant(tenantRoleMappingData, request);
      }
    }
    return result;
  }

  async assignUserToTenant(tenantsData, request) {
    try {
      const tenantId = tenantsData?.tenantRoleMapping?.tenantId;
      const userId = tenantsData?.userId;
      const roleId = tenantsData?.tenantRoleMapping?.roleId;

      if (roleId) {
        const data = await this.userRoleMappingRepository.save({
          userId: userId,
          tenantId: tenantId,
          roleId: roleId,
          createdBy: request['user'].userId,
          updatedBy: request['user'].userId
        })
      }

      const data = await this.userTenantMappingRepository.save({
        userId: userId,
        tenantId: tenantId,
        createdBy: request['user'].userId,
        updatedBy: request['user'].userId
      })


    } catch (error) {
      throw new Error(error)
    }
  }

  public async validateUserTenantMapping(userId: string, tenantId: string) {
    // check if tenant exists
    const tenantExist = await this.tenantsRepository.findOne({ where: { tenantId: tenantId } });
    if (!tenantExist) {
      return false
    } else {
      return true
    }
  }

  async addCohortMember(cohortData) {
    let result = await this.cohortMemberRepository.save(cohortData);
    return result;
  }

  public async resetUserPassword(
    request: any,
    username: string,
    newPassword: string,
    response: Response
  ) {
    const apiId = APIID.USER_RESET_PASSWORD;
    try {
      const userData: any = await this.findUserDetails(null, username);
      let userId;

      if (userData?.userId) {
        userId = userData?.userId;
      } else {
        return APIResponse.error(response, apiId, "Not Found", `User with given username not found`, HttpStatus.NOT_FOUND);
      }

      // const data = JSON.stringify({
      //   temporary: "false",
      //   type: "password",
      //   value: newPassword,
      // });

      const keycloakResponse = await getKeycloakAdminToken();
      const resToken = keycloakResponse.data.access_token;
      let apiResponse;

      try {
        apiResponse = await this.resetKeycloakPassword(
          request,
          resToken,
          newPassword,
          userId
        );
      } catch (e) {
        return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${e?.response?.data.error}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (apiResponse.statusCode === 204) {
        return await APIResponse.success(response, apiId, {},
          HttpStatus.NO_CONTENT, 'User Password Updated Successfully.')
      } else {
        return APIResponse.error(response, apiId, "Bad Request", `Error : ${apiResponse?.errors}`, HttpStatus.BAD_REQUEST);
      }
    } catch (e) {
      // return e;
      return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${e?.response?.data.error}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  public async resetKeycloakPassword(
    request: any,
    token: string,
    newPassword: string,
    userId: string
  ) {
    const data = JSON.stringify({
      temporary: "false",
      type: "password",
      value: newPassword,
    });

    if (!token) {
      const response = await getKeycloakAdminToken();
      token = response.data.access_token;
    }

    let apiResponse;

    const config = {
      method: "put",
      url:
        process.env.KEYCLOAK +
        process.env.KEYCLOAK_ADMIN +
        "/" +
        userId +
        "/reset-password",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      data: data,
    };

    try {
      apiResponse = await this.axios(config);
    } catch (e) {
      return new ErrorResponse({
        errorCode: `${e.response.status}`,
        errorMessage: e.response.data.error,
      });
    }

    if (apiResponse.status === 204) {
      return new SuccessResponse({
        statusCode: apiResponse.status,
        message: apiResponse.statusText,
        data: { msg: "Password reset successful!" },
      });
    } else {
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: apiResponse.errors,
      });
    }
  }

  public async validateCustomField(userCreateDto, response, apiId) {
    let fieldValues = userCreateDto ? userCreateDto.customFields : [];
    let encounteredKeys = [];
    let invalidateFields = [];
    let duplicateFieldKeys = [];
    let error = '';
    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData['fieldId'];
      let getFieldDetails: any = await this.fieldsService.getFieldByIdes(fieldId)

      if (getFieldDetails == null) {
        return error = 'Field not found';
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails['name']}`)
      } else {
        encounteredKeys.push(fieldId)
      }

      if ((getFieldDetails.type == 'checkbox' || getFieldDetails.type == 'drop_down' || getFieldDetails.type == 'radio') && getFieldDetails.sourceDetails.source == 'table') {
        let getOption = await this.fieldsService.findDynamicOptions(getFieldDetails.sourceDetails.table);

        const transformedFieldParams = {
          options: getOption.map(param => ({ value: param.value, label: param.label }))
        };
        getFieldDetails['fieldParams'] = transformedFieldParams

        // getFieldDetails['fieldParams'] = getOption
      } else {
        getFieldDetails['fieldParams'] = getFieldDetails.fieldParams;
      }

      let checkValidation = this.fieldsService.validateFieldValue(getFieldDetails, fieldsData['value'])


      if (typeof checkValidation === 'object' && 'error' in checkValidation) {
        invalidateFields.push(`${fieldId}: ${getFieldDetails['name']} - ${checkValidation?.error?.message}`)
      }
    };

    //Validation for duplicate fields
    if (duplicateFieldKeys.length > 0) {
      return error = `Duplicate fieldId detected: ${duplicateFieldKeys}`;
    }

    //Validation for fields values
    if (invalidateFields.length > 0) {
      return error = `Invalid fields found: ${invalidateFields}`;
    }

    //Verifying whether these fields correspond to their respective roles.
    let roleIds = userCreateDto && userCreateDto.tenantCohortRoleMapping ? userCreateDto.tenantCohortRoleMapping.map(userRole => userRole.roleId) : [];

    let contextType;
    if (roleIds) {
      let getRoleName = await this.roleRepository.find({
        where: { roleId: In(roleIds) },
        select: ["title"]
      })
      contextType = getRoleName.map(role => role?.title.toUpperCase()).join(', ')
    }

    let context = 'USERS';
    let getFieldIds = await this.fieldsService.getFieldIds(context, contextType)


    const validFieldIds = new Set(getFieldIds.map(field => field.fieldId));

    const invalidFieldIds = userCreateDto.customFields
      .filter(fieldValue => !validFieldIds.has(fieldValue.fieldId))
      .map(fieldValue => fieldValue.fieldId);


    if (invalidFieldIds.length > 0) {
      return error = `The following fields are not valid for this user: ${invalidFieldIds.join(', ')}.`;
    }

  }

  public async deleteUserById(userId: string, response: Response) {
    const apiId = APIID.USER_DELETE;
    const { KEYCLOAK, KEYCLOAK_ADMIN } = process.env;
    // Validate userId format
    if (!isUUID(userId)) {
      return APIResponse.error(response, apiId, "Bad request", `Please Enter Valid UUID for userId`, HttpStatus.BAD_REQUEST);
    }

    try {
      // Check if user exists in usersRepository
      const user = await this.usersRepository.findOne({ where: { userId: userId } });
      if (!user) {
        return APIResponse.error(response, apiId, "Not Found", `User not found in user table.`, HttpStatus.NOT_FOUND);
      }


      // Delete from User table
      const userResult = await this.usersRepository.delete(userId);

      // Delete from CohortMembers table
      const cohortMembersResult = await this.cohortMemberRepository.delete({ userId: userId });

      // Delete from UserTenantMapping table
      const userTenantMappingResult = await this.userTenantMappingRepository.delete({ userId: userId });

      // Delete from UserRoleMapping table
      const userRoleMappingResult = await this.userRoleMappingRepository.delete({ userId: userId });

      // Delete from FieldValues table where ItemId matches userId
      const fieldValuesResult = await this.fieldsValueRepository.delete({ itemId: userId });

      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      await this.axios.delete(`${KEYCLOAK}${KEYCLOAK_ADMIN}/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return await APIResponse.success(response, apiId, userResult,
        HttpStatus.OK, "User and related entries deleted Successfully.")
    } catch (e) {
      return APIResponse.error(response, apiId, "Internal Server Error", `Error : ${e?.response?.data.error}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
