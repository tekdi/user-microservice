import { HttpStatus, Injectable } from '@nestjs/common';
import { User } from '../../user/entities/user-entity';
import { FieldValues } from 'src/fields/entities/fields-values.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserCreateDto } from '../../user/dto/user-create.dto';
import jwt_decode from 'jwt-decode';
import {
  getKeycloakAdminToken,
  createUserInKeyCloak,
  updateUserInKeyCloak,
  checkIfUsernameExistsInKeycloak,
  checkIfEmailExistsInKeycloak,
} from '../../common/utils/keycloak.adapter.util';
import { ErrorResponse } from 'src/error-response';
import { SuccessResponse } from 'src/success-response';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
import { isUUID } from 'class-validator';
import { UserSearchDto } from 'src/user/dto/user-search.dto';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import { UserRoleMapping } from 'src/rbac/assign-role/entities/assign-role.entity';
import { Tenants } from 'src/userTenantMapping/entities/tenant.entity';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import { Role } from 'src/rbac/role/entities/role.entity';
import { UserData } from 'src/user/user.controller';
import APIResponse from 'src/common/responses/response';
import { Response, query } from 'express';
import { APIID } from 'src/common/utils/api-id.config';
import { IServicelocator } from '../userservicelocator';
import { PostgresFieldsService } from './fields-adapter';
import { PostgresRoleService } from './rbac/role-adapter';
import { CustomFieldsValidation } from '@utils/custom-field-validation';
import { NotificationRequest } from '@utils/notification.axios';
import { JwtUtil } from '@utils/jwt-token';
import { ConfigService } from '@nestjs/config';
import { formatTime } from '@utils/formatTimeConversion';
import { API_RESPONSES } from '@utils/response.messages';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { CohortAcademicYearService } from './cohortAcademicYear-adapter';
import { PostgresAcademicYearService } from './academicyears-adapter';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { AuthUtils } from '@utils/auth-util';
import { OtpSendDTO } from 'src/user/dto/otpSend.dto';
import { OtpVerifyDTO } from 'src/user/dto/otpVerify.dto';
import { SendPasswordResetOTPDto } from 'src/user/dto/passwordReset.dto';
import { ActionType, UserUpdateDTO } from 'src/user/dto/user-update.dto';

interface UpdateField {
  userId: string; // Required
  firstName?: string; // Optional
  lastName?: string; // Optional
  username?: string; // Optional
  email?: string; // Optional
}
@Injectable()
export class PostgresUserService implements IServicelocator {
  axios = require('axios');
  jwt_password_reset_expires_In: any;
  jwt_secret: any;
  reset_frontEnd_url: any;
  //SMS notification
  private readonly otpExpiry: number;
  private readonly otpDigits: number;
  private readonly smsKey: string;

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
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private fieldsService: PostgresFieldsService,
    private readonly postgresRoleService: PostgresRoleService,
    private readonly notificationRequest: NotificationRequest,
    private readonly jwtUtil: JwtUtil,
    private configService: ConfigService,
    private postgresAcademicYearService: PostgresAcademicYearService,
    private readonly cohortAcademicYearService: CohortAcademicYearService,
    private readonly authUtils: AuthUtils
  ) {
    this.jwt_secret = this.configService.get<string>('RBAC_JWT_SECRET');
    this.jwt_password_reset_expires_In = this.configService.get<string>(
      'PASSWORD_RESET_JWT_EXPIRES_IN'
    );
    this.reset_frontEnd_url =
      this.configService.get<string>('RESET_FRONTEND_URL');
    this.otpExpiry = this.configService.get<number>('OTP_EXPIRY') || 10; // default: 10 minutes
    this.otpDigits = this.configService.get<number>('OTP_DIGITS') || 6;
    this.smsKey = this.configService.get<string>('SMS_KEY');
  }

  public async sendPasswordResetLink(
    request: any,
    username: string,
    redirectUrl: string,
    response: Response
  ) {
    const apiId = APIID.USER_RESET_PASSWORD_LINK;
    try {
      // Fetch user details
      const userData: any = await this.findUserDetails(null, username);
      if (!userData) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USERNAME_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      // Determine email address
      let emailOfUser = userData?.email;
      console.log('sss', emailOfUser);

      if (!emailOfUser) {
        const createdByUser = await this.usersRepository.findOne({
          where: { userId: userData.createdBy },
        });
        emailOfUser = createdByUser?.email;
      }
      if (!emailOfUser) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.EMAIL_NOT_FOUND_FOR_RESET,
          HttpStatus.BAD_REQUEST
        );
      }

      //Generate Token for password Reset
      const tokenPayload = {
        sub: userData.userId,
        email: emailOfUser,
      };
      const jwtExpireTime = this.jwt_password_reset_expires_In;
      const jwtSecretKey = this.jwt_secret;
      const frontEndUrl = `${this.reset_frontEnd_url}/reset-password`;
      const resetToken = await this.jwtUtil.generateTokenForForgotPassword(
        tokenPayload,
        jwtExpireTime,
        jwtSecretKey
      );

      // Format expiration time
      const time = formatTime(jwtExpireTime);
      const programName = userData?.tenantData[0]?.tenantName;
      console.log('programName', userData);

      const capilatizeFirstLettterOfProgram = programName
        ? programName.charAt(0).toUpperCase() + programName.slice(1)
        : 'Learner Account';

      //Send Notification
      const notificationPayload = {
        isQueue: false,
        context: 'USER',
        key: 'OnForgotPasswordReset',
        replacements: {
          '{username}': userData?.username,
          '{resetToken}': resetToken,
          '{programName}': capilatizeFirstLettterOfProgram,
          '{expireTime}': time,
          '{frontEndUrl}': frontEndUrl,
          '{redirectUrl}': redirectUrl,
        },
        email: {
          receipients: [emailOfUser],
        },
      };
      console.log('notificationPayload', notificationPayload);

      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload
      );

      if (mailSend?.result?.email?.errors.length > 0) {
        LoggerUtil.error(
          `${API_RESPONSES.BAD_REQUEST}`,
          `Error: ${API_RESPONSES.RESET_PASSWORD_LINK_FAILED}`,
          apiId
        );
        return APIResponse.error(
          response,
          apiId,
          mailSend?.result?.email?.errors,
          API_RESPONSES.RESET_PASSWORD_LINK_FAILED,
          HttpStatus.BAD_REQUEST
        );
      }

      return await APIResponse.success(
        response,
        apiId,
        { email: emailOfUser },
        HttpStatus.OK,
        API_RESPONSES.RESET_PASSWORD_LINK_SUCCESS
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.INTERNAL_SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error : ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async forgotPassword(
    request: any,
    body: any,
    response: Response<any, Record<string, any>>
  ) {
    const apiId = APIID.USER_FORGOT_PASSWORD;
    try {
      const jwtSecretKey = this.jwt_secret;
      const decoded = await this.jwtUtil.validateToken(
        body.token,
        jwtSecretKey
      );
      const userDetail = await this.usersRepository.findOne({
        where: { userId: decoded.sub },
      });
      if (!userDetail) {
        LoggerUtil.error(
          `${API_RESPONSES.NOT_FOUND}`,
          API_RESPONSES.USERNAME_NOT_FOUND,
          apiId
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USER_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      const userData: any = await this.findUserDetails(
        null,
        userDetail.username
      );
      const keycloakResponse = await getKeycloakAdminToken();
      const keyClocktoken = keycloakResponse.data.access_token;
      let apiResponse: any;
      try {
        apiResponse = await this.resetKeycloakPassword(
          request,
          userData,
          keyClocktoken,
          body.newPassword,
          userDetail.userId
        );
        //update tempPassword status
        if (apiResponse?.statusCode === 204) {
          if (userData.temporaryPassword) {
            await this.usersRepository.update(userData.userId, {
              temporaryPassword: false,
            });
          }
        }
      } catch (e) {
        LoggerUtil.error(
          `${API_RESPONSES.INTERNAL_SERVER_ERROR}`,
          `Error: ${e.message}`,
          apiId
        );

        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          `Error : ${e?.response?.data.error}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      return await APIResponse.success(
        response,
        apiId,
        {},
        HttpStatus.OK,
        API_RESPONSES.FORGOT_PASSWORD_SUCCESS
      );
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        // Handle the specific case where the token is expired
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.LINK_EXPIRED,
          API_RESPONSES.INVALID_LINK,
          HttpStatus.UNAUTHORIZED
        );
      } else if (e.name === 'InvalidTokenError') {
        // Handle the case where the token is invalid
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_TOKEN,
          API_RESPONSES.UNAUTHORIZED,
          HttpStatus.UNAUTHORIZED
        );
      } else if (e instanceof JsonWebTokenError) {
        // Handle the case where the token is invalid
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_TOKEN,
          API_RESPONSES.UNAUTHORIZED,
          HttpStatus.UNAUTHORIZED
        );
      }
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error : ${e?.response?.data.error}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async searchUser(
    tenantId: string,
    request: any,
    response: any,
    userSearchDto: UserSearchDto
  ) {
    const apiId = APIID.USER_LIST;
    try {
      const findData = await this.findAllUserDetails(userSearchDto);

      if (findData === false) {
        LoggerUtil.error(
          `${API_RESPONSES.NOT_FOUND}: ${request.url}`,
          API_RESPONSES.USER_NOT_FOUND,
          apiId
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.USER_NOT_FOUND,
          API_RESPONSES.NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      LoggerUtil.log(API_RESPONSES.USER_GET_SUCCESSFULLY, apiId);
      return await APIResponse.success(
        response,
        apiId,
        findData,
        HttpStatus.OK,
        API_RESPONSES.USER_GET_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${e.message}`,
        apiId
      );

      const errorMessage = e.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAllUserDetails(userSearchDto) {
    let { limit, offset, filters, exclude, sort } = userSearchDto;
    let excludeCohortIdes;
    let excludeUserIdes;

    offset = offset ? `OFFSET ${offset}` : '';
    limit = limit ? `LIMIT ${limit}` : '';
    const result = {
      totalCount: 0,
      getUserDetails: [],
    };

    let whereCondition = `WHERE`;
    let index = 0;
    const searchCustomFields: any = {};

    const userAllKeys = this.usersRepository.metadata.columns.map(
      (column) => column.propertyName
    );
    const userKeys = userAllKeys.filter(
      (key) => key !== 'district' && key !== 'state'
    );

    if (filters && Object.keys(filters).length > 0) {
      for (const [key, value] of Object.entries(filters)) {
        if (index > 0) {
          whereCondition += ` AND `;
        }
        if (userKeys.includes(key)) {
          if (key === 'firstName') {
            whereCondition += ` U."${key}" ILIKE '%${value}%'`;
          } else {
            if (key === 'status' || key === 'email') {
              if (
                Array.isArray(value) &&
                value.every((item) => typeof item === 'string')
              ) {
                const status = value
                  .map((item) => `'${item.trim().toLowerCase()}'`)
                  .join(',');
                whereCondition += ` U."${key}" IN(${status})`;
              }
            } else {
              whereCondition += ` U."${key}" = '${value}'`;
            }
          }
          index++;
        } else {
          if (key == 'role') {
            whereCondition += ` R."name" = '${value}'`;
            index++;
          } else {
            searchCustomFields[key] = value;
          }
        }
      }
    }

    if (exclude && Object.keys(exclude).length > 0) {
      Object.entries(exclude).forEach(([key, value]) => {
        if (key == 'cohortIds') {
          excludeCohortIdes = value;
        }
        if (key == 'userIds') {
          excludeUserIdes = value;
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
      const context = 'USERS';
      getUserIdUsingCustomFields =
        await this.fieldsService.filterUserUsingCustomFields(
          context,
          searchCustomFields
        );

      if (getUserIdUsingCustomFields == null) {
        return false;
      }
    }

    if (getUserIdUsingCustomFields && getUserIdUsingCustomFields.length > 0) {
      const userIdsDependsOnCustomFields = getUserIdUsingCustomFields
        .map((userId) => `'${userId}'`)
        .join(',');
      whereCondition += `${
        index > 0 ? ' AND ' : ''
      } U."userId" IN (${userIdsDependsOnCustomFields})`;
      index++;
    }

    const userIds =
      excludeUserIdes?.length > 0
        ? excludeUserIdes.map((userId) => `'${userId}'`).join(',')
        : null;

    const cohortIds =
      excludeCohortIdes?.length > 0
        ? excludeCohortIdes.map((cohortId) => `'${cohortId}'`).join(',')
        : null;

    if (userIds || cohortIds) {
      const userCondition = userIds ? ` U."userId" NOT IN (${userIds})` : '';
      const cohortCondition = cohortIds
        ? `CM."cohortId" NOT IN (${cohortIds})`
        : '';
      const combinedCondition = [userCondition, cohortCondition]
        .filter(String)
        .join(' AND ');
      whereCondition += (index > 0 ? ' AND ' : '') + combinedCondition;
    } else if (index === 0) {
      whereCondition = '';
    }

    //Get user core fields data
    const query = `SELECT U."userId", U."username",U."email", U."firstName", U."middleName", U."lastName", U."gender", U."dob", R."name" AS role, U."mobile", U."createdBy",U."updatedBy", U."createdAt", U."updatedAt", U.status, COUNT(*) OVER() AS total_count 
      FROM  public."Users" U
      LEFT JOIN public."CohortMembers" CM 
      ON CM."userId" = U."userId"
      LEFT JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      LEFT JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCondition} GROUP BY U."userId", R."name" ${orderingCondition} ${offset} ${limit}`;
    const userDetails = await this.usersRepository.query(query);

    if (userDetails.length > 0) {
      result.totalCount = parseInt(userDetails[0].total_count, 10);

      // Get user custom field data
      for (const userData of userDetails) {
        const customFields = await this.fieldsService.getUserCustomFieldDetails(
          userData.userId
        );
        userData['customFields'] = customFields.map((data) => ({
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
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          `Error: ${API_RESPONSES.UUID_VALIDATION}`,
          HttpStatus.BAD_REQUEST
        );
      }
      const checkExistUser = await this.usersRepository.find({
        where: {
          userId: userData.userId,
        },
      });

      if (checkExistUser.length == 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USERID_NOT_FOUND(userData.userId),
          HttpStatus.NOT_FOUND
        );
      }

      const result = {
        userData: {},
      };

      const [userDetails, userRole] = await Promise.all([
        this.findUserDetails(userData?.userId),
        userData && userData?.tenantId
          ? this.findUserRoles(userData?.userId, userData?.tenantId)
          : Promise.resolve(null),
      ]);

      let roleInUpper;
      if (userRole) {
        roleInUpper = userRole ? userRole.title.toUpperCase() : null;
        userDetails['role'] = userRole.title;
      }

      if (!userDetails) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USERNAME_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      if (!userData.fieldValue) {
        LoggerUtil.log(API_RESPONSES.USER_GET_SUCCESSFULLY, apiId);
        return await APIResponse.success(
          response,
          apiId,
          { userData: userDetails },
          HttpStatus.OK,
          API_RESPONSES.USER_GET_SUCCESSFULLY
        );
      }

      let customFields;

      if (userData && userData?.fieldValue) {
        const context = 'USERS';
        const contextType = roleInUpper;
        // customFields = await this.fieldsService.getFieldValuesData(userData.userId, context, contextType, ['All'], true);
        customFields = await this.fieldsService.getUserCustomFieldDetails(
          userData.userId
        );
      }

      result.userData = userDetails;

      result.userData['customFields'] = customFields;

      LoggerUtil.log(
        API_RESPONSES.USER_GET_SUCCESSFULLY,
        apiId,
        userData?.userId
      );

      return await APIResponse.success(
        response,
        apiId,
        { ...result },
        HttpStatus.OK,
        API_RESPONSES.USER_GET_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findUserName(cohortId: string, role: string) {
    let query = `SELECT U."userId", U.username, U.name, U.role, U.mobile FROM public."CohortMembers" CM   
    LEFT JOIN public."Users" U 
    ON CM."userId" = U."userId"
    where CM."cohortId" =$1 `;
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
        tenantId: tenantId,
      },
    });
    if (!getRole) {
      return false;
    }
    let role;
    role = await this.roleRepository.findOne({
      where: {
        roleId: getRole.roleId,
      },
      select: ['title', 'code'],
    });
    return role;
  }

  async findUserDetails(userId, username?: any, tenantId?: string) {
    const whereClause: any = { userId: userId };
    if (username && userId === null) {
      delete whereClause.userId;
      whereClause.username = username;
    }
    const userDetails = await this.usersRepository.findOne({
      where: whereClause,
      select: [
        'userId',
        'username',
        'firstName',
        'middleName',
        'lastName',
        'gender',
        'dob',
        'mobile',
        'email',
        'temporaryPassword',
        'createdBy',
        'deviceId',
      ],
    });
    if (!userDetails) {
      return false;
    }
    const tenentDetails = await this.userTenantRoleData(userDetails.userId);
    if (!tenentDetails) {
      return userDetails;
    }
    const tenantData = tenantId
      ? tenentDetails.filter((item) => item.tenantId === tenantId)
      : tenentDetails;
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
    const roleArray = [];
    for (const data of result) {
      const roleData = await this.postgresRoleService.findUserRoleData(
        userId,
        data.tenantId
      );
      if (roleData.length > 0) {
        roleArray.push(roleData[0].roleid);
        const roleId = roleData[0].roleid;
        const roleName = roleData[0].title;

        const privilegeData =
          await this.postgresRoleService.findPrivilegeByRoleId(roleArray);
        const privileges = privilegeData.map((priv) => priv.name);

        combinedResult.push({
          tenantName: data.tenantname,
          tenantId: data.tenantId,
          userTenantMappingId: data.usertenantmappingid,
          roleId: roleId,
          roleName: roleName,
          privileges: privileges,
        });
      }
    }

    return combinedResult;
  }

  async updateUser(userDto, response: Response) {
    const apiId = APIID.USER_UPDATE;
    try {
      const updatedData = {};
      const editIssues = {};

      const user = await this.usersRepository.findOne({
        where: { userId: userDto.userId },
      });
      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.USER_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }

      //mutideviceId
      if (userDto?.userData?.deviceId) {
        let deviceIds: any;
        if (userDto.userData.action === ActionType.ADD) {
          // add deviceId
          deviceIds = await this.loginDeviceIdAction(
            userDto.userData.deviceId,
            userDto.userId,
            user.deviceId
          );
          userDto.userData.deviceId = deviceIds;
        } else if (userDto.userData.action === ActionType.REMOVE) {
          //remove deviceId
          deviceIds = await this.onLogoutDeviceId(
            userDto.userData.deviceId,
            userDto.userId,
            user.deviceId
          );
          userDto.userData.deviceId = deviceIds;
        }
      }

      const { username, firstName, lastName, email } = userDto.userData;
      const userId = userDto.userId;
      const keycloakReqBody = { username, firstName, lastName, userId, email };

      //Update userdetails on keycloak
      if (username || firstName || lastName || email) {
        try {
          const keycloakUpdateResult = await this.updateUsernameInKeycloak(
            keycloakReqBody
          );

          if (keycloakUpdateResult === 'exists') {
            return APIResponse.error(
              response,
              apiId,
              API_RESPONSES.USERNAME_EXISTS_KEYCLOAK,
              API_RESPONSES.USERNAME_EXISTS_KEYCLOAK,
              HttpStatus.CONFLICT
            );
          }

          if (!keycloakUpdateResult) {
            return APIResponse.error(
              response,
              apiId,
              API_RESPONSES.UPDATE_USER_KEYCLOAK_ERROR,
              API_RESPONSES.UPDATE_USER_KEYCLOAK_ERROR,
              HttpStatus.BAD_REQUEST
            );
          }
        } catch (error) {
          LoggerUtil.error(
            API_RESPONSES.SERVER_ERROR,
            `Keycloak update failed: ${error.message}`,
            apiId
          );
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.SERVER_ERROR,
            API_RESPONSES.UPDATE_USER_KEYCLOAK_ERROR,
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }
      }

      if (userDto.userData) {
        await this.updateBasicUserDetails(userDto.userId, userDto.userData);
        updatedData['basicDetails'] = userDto.userData;
      }

      LoggerUtil.log(
        API_RESPONSES.USER_BASIC_DETAILS_UPDATE,
        apiId,
        userDto?.userId
      );

      if (userDto?.customFields?.length > 0) {
        const getFieldsAttributes =
          await this.fieldsService.getEditableFieldsAttributes();

        const isEditableFieldId = [];
        const fieldIdAndAttributes = {};
        for (const fieldDetails of getFieldsAttributes) {
          isEditableFieldId.push(fieldDetails.fieldId);
          fieldIdAndAttributes[`${fieldDetails.fieldId}`] = fieldDetails;
        }

        const unEditableIdes = [];
        const editFailures = [];
        for (const data of userDto.customFields) {
          if (isEditableFieldId.includes(data.fieldId)) {
            const result = await this.fieldsService.updateCustomFields(
              userDto.userId,
              data,
              fieldIdAndAttributes[data.fieldId]
            );
            if (result.correctValue) {
              if (!updatedData['customFields'])
                updatedData['customFields'] = [];
              updatedData['customFields'].push(result);
            } else {
              editFailures.push(
                `${data.fieldId}: ${result?.valueIssue} - ${result.fieldName}`
              );
            }
          } else {
            unEditableIdes.push(data.fieldId);
          }
        }
        if (unEditableIdes.length > 0) {
          editIssues['uneditableFields'] = unEditableIdes;
        }
        if (editFailures.length > 0) {
          editIssues['editFieldsFailure'] = editFailures;
        }
      }

      LoggerUtil.log(
        API_RESPONSES.USER_UPDATED_SUCCESSFULLY,
        apiId,
        userDto?.userId
      );

      return await APIResponse.success(
        response,
        apiId,
        { ...updatedData, editIssues },
        HttpStatus.OK,
        API_RESPONSES.USER_UPDATED_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );

      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        API_RESPONSES.SOMETHING_WRONG,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async updateUsernameInKeycloak(
    updateField: UpdateField
  ): Promise<'exists' | false | true> {
    try {
      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      //Check user is exist in keycloakDB or not
      const checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(
        updateField
      );
      if (checkUserinKeyCloakandDb) {
        return 'exists';
      }

      //Update user in keyCloakService
      let updateResult = await updateUserInKeyCloak(updateField, token);
      if (updateResult.success === false) {
        return false;
      }
      return true;
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `KeyCloak Error: ${error.message}`
      );
      return false;
    }
  }

  async loginDeviceIdAction(
    userDeviceId: string,
    userId: string,
    existingDeviceId: string[]
  ): Promise<string[]> {
    let deviceIds = existingDeviceId || [];
    // Check if the device ID already exists
    if (deviceIds.includes(userDeviceId)) {
      return deviceIds; // No action if device ID already exists
    }
    // If there are already 3 devices, remove the first one (oldest)
    if (deviceIds.length === 3) {
      deviceIds.shift(); // Remove the oldest device ID
    }
    // Add the new device ID to the list
    deviceIds.push(userDeviceId);
    return deviceIds; // Return the updated device list
  }

  async onLogoutDeviceId(
    deviceIdforRemove: string,
    userId: string,
    existingDeviceId: string[]
  ) {
    let deviceIds = existingDeviceId || [];
    // Check if the device ID exists
    if (!deviceIds.includes(deviceIdforRemove)) {
      return deviceIds; // No action if device ID does not exist
    }
    // Remove the device ID
    deviceIds = deviceIds.filter((id) => id !== deviceIdforRemove);
    return deviceIds;
  }

  async updateBasicUserDetails(
    userId: string,
    userData: Partial<User>
  ): Promise<User | null> {
    try {
      // Fetch the user by ID
      const user = await this.usersRepository.findOne({ where: { userId } });

      if (!user) {
        return null;
      }

      await Object.assign(user, userData);
      return this.usersRepository.save(user);
    } catch (error) {
      // Re-throw or handle the error as needed
      throw new Error('An error occurred while updating user details');
    }
  }

  async createUser(
    request: any,
    userCreateDto: UserCreateDto,
    academicYearId: string,
    response: Response
  ) {
    const apiId = APIID.USER_CREATE;
    // It is considered that if user is not present in keycloak it is not present in database as well

    try {
      if (request.headers.authorization) {
        const decoded: any = jwt_decode(request.headers.authorization);
        userCreateDto.createdBy = decoded?.sub;
        userCreateDto.updatedBy = decoded?.sub;
      }

      let customFieldError;
      if (userCreateDto.customFields && userCreateDto.customFields.length > 0) {
        customFieldError = await this.validateCustomField(
          userCreateDto,
          response,
          apiId
        );

        if (customFieldError) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `${customFieldError}`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      // check and validate all fields
      const validatedRoles: any = await this.validateRequestBody(
        userCreateDto,
        academicYearId
      );

      // check if roles are invalid and academic year is provided
      if (
        Array.isArray(validatedRoles) &&
        validatedRoles.some((item) => item?.code === undefined)
      ) {
        return APIResponse.error(
          response,
          apiId,
          'BAD_REQUEST',
          validatedRoles.join('; '),
          HttpStatus.BAD_REQUEST
        );
      }

      userCreateDto.username = userCreateDto.username.toLocaleLowerCase();
      const userSchema = new UserCreateDto(userCreateDto);

      let errKeycloak = '';
      let resKeycloak;

      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;
      const checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(
        userCreateDto
      );
      // let checkUserinDb = await this.checkUserinKeyCloakandDb(userCreateDto.username);
      if (checkUserinKeyCloakandDb) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.USER_EXISTS,
          HttpStatus.BAD_REQUEST
        );
      }

      resKeycloak = await createUserInKeyCloak(userSchema, token);

      if (resKeycloak.statusCode !== 201) {
        if (resKeycloak.statusCode === 409) {
          LoggerUtil.log(API_RESPONSES.EMAIL_EXIST, apiId);

          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.EMAIL_EXIST,
            `${resKeycloak.message} ${resKeycloak.email}`,
            HttpStatus.CONFLICT
          );
        } else {
          LoggerUtil.log(API_RESPONSES.SERVER_ERROR, apiId);
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.SERVER_ERROR,
            `${resKeycloak.message}`,
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }
      }

      LoggerUtil.log(API_RESPONSES.USER_CREATE_KEYCLOAK, apiId);

      userCreateDto.userId = resKeycloak.userId;

      // if cohort given then check for academic year

      const result = await this.createUserInDatabase(
        request,
        userCreateDto,
        academicYearId,
        response
      );

      LoggerUtil.log(API_RESPONSES.USER_CREATE_IN_DB, apiId);

      const createFailures = [];
      if (
        result &&
        userCreateDto.customFields &&
        userCreateDto.customFields.length > 0
      ) {
        const userId = result?.userId;
        let roles;

        if (validatedRoles) {
          roles = validatedRoles?.map(({ code }) => code?.toUpperCase());
        }

        const customFields = await this.fieldsService.findCustomFields(
          'USERS',
          roles
        );

        if (customFields) {
          const customFieldAttributes = customFields.reduce(
            (fieldDetail, { fieldId, fieldAttributes, fieldParams, name }) =>
              fieldDetail[`${fieldId}`]
                ? fieldDetail
                : {
                    ...fieldDetail,
                    [`${fieldId}`]: { fieldAttributes, fieldParams, name },
                  },
            {}
          );

          for (const fieldValues of userCreateDto.customFields) {
            const fieldData = {
              fieldId: fieldValues['fieldId'],
              value: fieldValues['value'],
            };

            const res = await this.fieldsService.updateCustomFields(
              userId,
              fieldData,
              customFieldAttributes[fieldData.fieldId]
            );

            if (res.correctValue) {
              if (!result['customFields']) result['customFields'] = [];
              result['customFields'].push(res);
            } else {
              createFailures.push(
                `${fieldData.fieldId}: ${res?.valueIssue} - ${res.fieldName}`
              );
            }
          }
        }
      }
      LoggerUtil.log(API_RESPONSES.USER_CREATE_SUCCESSFULLY, apiId);
      APIResponse.success(
        response,
        apiId,
        { userData: { ...result, createFailures } },
        HttpStatus.CREATED,
        API_RESPONSES.USER_CREATE_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${e.message}`,
        apiId
      );
      const errorMessage = e.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  createErrorCollector() {
    const errors: string[] = [];

    return {
      addError(message: string) {
        errors.push(message);
      },
      hasErrors(): boolean {
        return errors.length > 0;
      },
      getErrors(): string[] {
        return errors;
      },
      getFormattedErrors(): string {
        return errors.join('; ');
      },
    };
  }

  async validateRequestBody(userCreateDto, academicYearId) {
    const errorCollector = this.createErrorCollector();
    let roleData: any[] = [];
    const duplicateTenet = [];

    const error = [];
    for (const [key, value] of Object.entries(userCreateDto)) {
      if (key === 'email') {
        const checkValidEmail = CustomFieldsValidation.validate(
          'email',
          userCreateDto.email
        );
        if (!checkValidEmail) {
          errorCollector.addError(`Invalid email address`);
        }
      }

      if (key === 'mobile') {
        const checkValidMobile = CustomFieldsValidation.validate(
          'mobile',
          userCreateDto.mobile
        );
        if (!checkValidMobile) {
          errorCollector.addError(`Mobile number must be 10 digits long`);
        }
      }

      if (key === 'dob') {
        const checkValidDob = CustomFieldsValidation.validate(
          'date',
          userCreateDto.dob
        );
        if (!checkValidDob) {
          errorCollector.addError(
            `Date of birth must be in the format yyyy-mm-dd`
          );
        }
      }
    }

    if (userCreateDto.tenantCohortRoleMapping) {
      for (const tenantCohortRoleMapping of userCreateDto?.tenantCohortRoleMapping) {
        const { tenantId, cohortIds, roleId } = tenantCohortRoleMapping;

        if (!academicYearId && cohortIds) {
          errorCollector.addError(
            'Academic Year ID is required when a Cohort ID is provided.'
          );
        }

        // check academic year exists for tenant
        const checkAcadmicYear =
          await this.postgresAcademicYearService.getActiveAcademicYear(
            academicYearId,
            tenantId
          );

        if (!checkAcadmicYear && cohortIds) {
          errorCollector.addError(API_RESPONSES.ACADEMIC_YEAR_NOT_FOUND);
        }

        if (duplicateTenet.includes(tenantId)) {
          errorCollector.addError(API_RESPONSES.DUPLICAT_TENANTID);
        }

        if ((tenantId && !roleId) || (!tenantId && roleId)) {
          errorCollector.addError(API_RESPONSES.INVALID_PARAMETERS);
        }

        const [tenantExists, notExistCohort, roleExists] = await Promise.all([
          tenantId
            ? this.tenantsRepository.find({ where: { tenantId } })
            : Promise.resolve([]),
          tenantId && cohortIds
            ? this.checkCohortExistsInAcademicYear(academicYearId, cohortIds)
            : Promise.resolve([]),
          roleId
            ? this.roleRepository.find({ where: { roleId, tenantId } })
            : Promise.resolve([]),
        ]);

        if (tenantExists.length === 0) {
          errorCollector.addError(`Tenant Id '${tenantId}' does not exist.`);
        }

        if (notExistCohort.length > 0) {
          errorCollector.addError(
            `Cohort Id '${notExistCohort}' does not exist for this tenant '${tenantId}'.`
          );
        }

        if (roleExists && roleExists?.length === 0) {
          errorCollector.addError(
            `Role Id '${roleId}' does not exist for this tenant '${tenantId}'.`
          );
        } else if (roleExists) {
          roleData = [...roleData, ...roleExists];
        }
      }
    } else {
      return false;
    }
    return errorCollector.hasErrors() ? errorCollector.getErrors() : roleData;
  }

  async checkCohortExistsInAcademicYear(
    academicYearId: any,
    cohortData: any[]
  ) {
    // The method ensures that all cohorts provided in the cohortData array are associated with the given academicYearId. If any cohort does not exist in the academic year, it collects their IDs and returns them as a list.

    const notExistCohort = [];
    for (const cohortId of cohortData) {
      const findCohortData =
        await this.cohortAcademicYearService.isCohortExistForYear(
          academicYearId,
          cohortId
        );
      if (!findCohortData?.length) {
        notExistCohort.push(cohortId);
      }
    }

    return notExistCohort.length > 0 ? notExistCohort : [];
  }

  async checkUser(body) {
    const checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(body);
    if (checkUserinKeyCloakandDb) {
      return new SuccessResponse({
        statusCode: 200,
        message: API_RESPONSES.USER_EXISTS_SEND_MAIL,
        data: { data: true },
      });
    }
    return new SuccessResponse({
      statusCode: HttpStatus.BAD_REQUEST,
      message: API_RESPONSES.INVALID_USERNAME_EMAIL,
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

  async createUserInDatabase(
    request: any,
    userCreateDto: UserCreateDto,
    academicYearId: string,
    response: Response
  ) {
    const user = new User();
    (user.userId = userCreateDto?.userId),
      (user.username = userCreateDto?.username),
      (user.firstName = userCreateDto?.firstName),
      (user.middleName = userCreateDto?.middleName),
      (user.lastName = userCreateDto?.lastName),
      (user.gender = userCreateDto?.gender),
      (user.email = userCreateDto?.email),
      (user.mobile = Number(userCreateDto?.mobile) || null),
      (user.createdBy = userCreateDto?.createdBy || userCreateDto?.createdBy);

    if (userCreateDto?.dob) {
      user.dob = new Date(userCreateDto.dob);
    }
    const result = await this.usersRepository.save(user);

    if (result && userCreateDto.tenantCohortRoleMapping) {
      for (const mapData of userCreateDto.tenantCohortRoleMapping) {
        if (mapData.cohortIds) {
          for (const cohortIds of mapData.cohortIds) {
            let query = `SELECT * FROM public."CohortAcademicYear" WHERE "cohortId"= '${cohortIds}' AND "academicYearId" = '${academicYearId}'`;

            let getCohortAcademicYearId = await this.usersRepository.query(
              query
            );

            // will add data only if cohort is found with acadmic year
            let cohortData = {
              userId: result?.userId,
              cohortId: cohortIds,
              cohortAcademicYearId:
                getCohortAcademicYearId[0]['cohortAcademicYearId'] || null,
            };
            await this.addCohortMember(cohortData);
          }
        }

        const tenantRoleMappingData = {
          userId: result?.userId,
          tenantRoleMapping: mapData,
        };

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
          createdBy: request['user']?.userId || userId,
          updatedBy: request['user']?.userId || userId,
        });
      }

      const data = await this.userTenantMappingRepository.save({
        userId: userId,
        tenantId: tenantId,
        createdBy: request['user']?.userId || userId,
        updatedBy: request['user']?.userId || userId,
      });

      LoggerUtil.log(API_RESPONSES.USER_TENANT);
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${error.message}`
      );
      throw new Error(error);
    }
  }

  public async validateUserTenantMapping(userId: string, tenantId: string) {
    // check if tenant exists
    const tenantExist = await this.tenantsRepository.findOne({
      where: { tenantId: tenantId },
    });
    if (!tenantExist) {
      return false;
    } else {
      return true;
    }
  }

  async addCohortMember(cohortData) {
    const result = await this.cohortMemberRepository.save(cohortData);
    LoggerUtil.log(API_RESPONSES.USER_COHORT);
    return result;
  }

  public async resetUserPassword(
    request: any,
    extraField: string,
    newPassword: string,
    response: Response
  ) {
    const apiId = APIID.USER_RESET_PASSWORD;
    try {
      const user = request.user;

      const userData: any = await this.findUserDetails(null, user.username);
      let userId;

      if (userData?.userId) {
        userId = userData?.userId;
      } else {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USERID_NOT_FOUND(userId),
          HttpStatus.NOT_FOUND
        );
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
          userData,
          resToken,
          newPassword,
          userId
        );
      } catch (e) {
        LoggerUtil.error(
          `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
          `Error: ${e.message}`,
          apiId
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.SERVER_ERROR,
          `Error : ${e?.response?.data.error}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      if (apiResponse.statusCode === 204) {
        if (userData.temporaryPassword) {
          await this.usersRepository.update(userData.userId, {
            temporaryPassword: false,
          });
        }
        return await APIResponse.success(
          response,
          apiId,
          {},
          HttpStatus.OK,
          API_RESPONSES.USER_PASSWORD_UPDATE
        );
      } else {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          `Error : ${apiResponse?.errors}`,
          HttpStatus.BAD_REQUEST
        );
      }
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        `Error : ${e?.response?.data.error}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async resetKeycloakPassword(
    request: any,
    userData: any,
    token: string,
    newPassword: string,
    userId: string
  ) {
    const data = JSON.stringify({
      temporary: 'false',
      type: 'password',
      value: newPassword,
    });

    if (!token) {
      const response = await getKeycloakAdminToken();
      token = response.data.access_token;
    }

    let apiResponse;

    const config = {
      method: 'put',
      url:
        process.env.KEYCLOAK +
        process.env.KEYCLOAK_ADMIN +
        '/' +
        userId +
        '/reset-password',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      data: data,
    };

    try {
      apiResponse = await this.axios(config);
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${e.message}`
      );
      return new ErrorResponse({
        errorCode: `${e.response.status}`,
        errorMessage: e.response.data.error,
      });
    }

    if (apiResponse.status === 204) {
      if (userData.email) {
        //Send Notification
        const notificationPayload = {
          isQueue: false,
          context: 'USER',
          key: 'OnPasswordReset',
          replacements: {
            '{username}': userData?.name,
            '{programName}': userData?.tenantData?.[0]?.tenantName
              ? userData.tenantData[0].tenantName.charAt(0).toUpperCase() +
                userData.tenantData[0].tenantName.slice(1)
              : '',
          },
          email: {
            receipients: [userData.email],
          },
        };
        try {
          const mailSend = await this.notificationRequest.sendNotification(
            notificationPayload
          );
          if (mailSend?.result?.email?.errors.length > 0) {
            // error messgae if generated by notification service
          }
        } catch (error) {
          LoggerUtil.error(
            `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
            `Error: ${error.message}`
          );
        }
      }
      return new SuccessResponse({
        statusCode: apiResponse.status,
        message: apiResponse.statusText,
        data: { msg: API_RESPONSES.PASSWORD_RESET },
      });
    } else {
      return new ErrorResponse({
        errorCode: '400',
        errorMessage: apiResponse.errors,
      });
    }
  }

  public async validateCustomField(userCreateDto, response, apiId) {
    const fieldValues = userCreateDto ? userCreateDto.customFields : [];
    const encounteredKeys = [];
    const invalidateFields = [];
    const duplicateFieldKeys = [];
    let error = '';
    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData['fieldId'];
      const getFieldDetails: any = await this.fieldsService.getFieldByIdes(
        fieldId
      );

      if (getFieldDetails == null) {
        return API_RESPONSES.FIELD_NOT_FOUND;
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails['name']}`);
      } else {
        encounteredKeys.push(fieldId);
      }

      if (
        (getFieldDetails.type == 'checkbox' ||
          getFieldDetails.type == 'drop_down' ||
          getFieldDetails.type == 'radio') &&
        getFieldDetails.sourceDetails.source == 'table'
      ) {
        const getOption = await this.fieldsService.findDynamicOptions(
          getFieldDetails.sourceDetails.table
        );

        const transformedFieldParams = {
          options: getOption.map((param) => ({
            value: param.value,
            label: param.label,
          })),
        };
        getFieldDetails['fieldParams'] = transformedFieldParams;

        // getFieldDetails['fieldParams'] = getOption
      } else {
        getFieldDetails['fieldParams'] = getFieldDetails?.fieldParams || {};
      }

      const checkValidation = this.fieldsService.validateFieldValue(
        getFieldDetails,
        fieldsData['value']
      );

      if (typeof checkValidation === 'object' && 'error' in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails['name']} - ${checkValidation?.error?.message}`
        );
      }
    }

    //Validation for duplicate fields
    if (duplicateFieldKeys.length > 0) {
      error = API_RESPONSES.DUPLICATE_FIELD(duplicateFieldKeys);
      return error;
    }

    //Validation for fields values
    if (invalidateFields.length > 0) {
      error = API_RESPONSES.INVALID_FIELD(invalidateFields);
      return error;
    }

    //Verifying whether these fields correspond to their respective roles.
    const roleIds =
      userCreateDto && userCreateDto.tenantCohortRoleMapping
        ? userCreateDto.tenantCohortRoleMapping.map(
            (userRole) => userRole.roleId
          )
        : [];

    let contextType;
    if (roleIds) {
      const getRoleName = await this.roleRepository.find({
        where: { roleId: In(roleIds) },
        select: ['title'],
      });
      contextType = getRoleName
        .map((role) => role?.title.toUpperCase())
        .join(', ');
    }

    const context = 'USERS';
    const getFieldIds = await this.fieldsService.getFieldIds(
      context,
      contextType
    );

    const validFieldIds = new Set(getFieldIds.map((field) => field.fieldId));

    const invalidFieldIds = userCreateDto.customFields
      .filter((fieldValue) => !validFieldIds.has(fieldValue.fieldId))
      .map((fieldValue) => fieldValue.fieldId);

    if (invalidFieldIds.length > 0) {
      return `The following fields are not valid for this user: ${invalidFieldIds.join(
        ', '
      )}.`;
    }
  }

  public async deleteUserById(userId: string, response: Response) {
    const apiId = APIID.USER_DELETE;
    const { KEYCLOAK, KEYCLOAK_ADMIN } = process.env;
    // Validate userId format
    if (!isUUID(userId)) {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.BAD_REQUEST,
        API_RESPONSES.UUID_VALIDATION,
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      // Check if user exists in usersRepository
      const user = await this.usersRepository.findOne({
        where: { userId: userId },
      });
      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.USERNAME_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // Delete from User table
      const userResult = await this.usersRepository.delete(userId);

      // Delete from CohortMembers table
      const cohortMembersResult = await this.cohortMemberRepository.delete({
        userId: userId,
      });

      // Delete from UserTenantMapping table
      const userTenantMappingResult =
        await this.userTenantMappingRepository.delete({ userId: userId });

      // Delete from UserRoleMapping table
      const userRoleMappingResult = await this.userRoleMappingRepository.delete(
        { userId: userId }
      );

      // Delete from FieldValues table where ItemId matches userId
      const fieldValuesResult = await this.fieldsValueRepository.delete({
        itemId: userId,
      });

      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      await this.axios.delete(`${KEYCLOAK}${KEYCLOAK_ADMIN}/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return await APIResponse.success(
        response,
        apiId,
        userResult,
        HttpStatus.OK,
        API_RESPONSES.USER_RELATEDENTITY_DELETE
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${e?.response?.data.error}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  private formatMobileNumber(mobile: string): string {
    return `+91${mobile}`;
  }

  //Generate Has code as per username or mobile Number
  private generateOtpHash(
    mobileOrUsername: string,
    otp: string,
    reason: string
  ) {
    const ttl = this.otpExpiry * 60 * 1000; // Expiration in milliseconds
    const expires = Date.now() + ttl;
    const expiresInMinutes = ttl / (60 * 1000);
    const data = `${mobileOrUsername}.${otp}.${reason}.${expires}`;
    const hash = this.authUtils.calculateHash(data, this.smsKey); // Create hash
    return { hash, expires, expiresInMinutes };
  }

  // send SignUP OTP
  async sendOtp(body: OtpSendDTO, response: Response) {
    const apiId = APIID.SEND_OTP;
    try {
      const { mobile, reason } = body;
      if (!mobile || !/^\d{10}$/.test(mobile)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.MOBILE_VALID,
          HttpStatus.BAD_REQUEST
        );
      }
      // Step 1: Prepare data for OTP generation and send on Mobile
      const { notificationPayload, hash, expires } = await this.sendOTPOnMobile(
        mobile,
        reason
      );
      // Step 2: Send success response
      const result = {
        data: {
          message: `OTP sent to ${mobile}`,
          hash: `${hash}.${expires}`,
          sendStatus: notificationPayload.result?.sms?.data[0],
          // sid: message.sid, // Twilio Message SID
        },
      };
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.OTP_SEND_SUCCESSFULLY
      );
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async sendOTPOnMobile(mobile: string, reason: string) {
    try {
      // Step 1: Format mobile number and generate OTP
      const mobileWithCode = this.formatMobileNumber(mobile);
      const otp = this.authUtils.generateOtp(this.otpDigits).toString();
      const { hash, expires, expiresInMinutes } = this.generateOtpHash(
        mobileWithCode,
        otp,
        reason
      );
      const replacements = {
        '{OTP}': otp,
        '{otpExpiry}': expiresInMinutes,
      };
      // Step 2:send SMS notification
      const notificationPayload = await this.smsNotification(
        'OTP',
        'SEND_OTP',
        replacements,
        [mobile]
      );
      return { notificationPayload, hash, expires, expiresInMinutes };
    } catch (error) {
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }
  //verify OTP based on reason [signup , forgot]
  async verifyOtp(body: OtpVerifyDTO, response: Response) {
    const apiId = APIID.VERIFY_OTP;
    try {
      const { mobile, otp, hash, reason, username } = body;
      if (!otp || !hash || !reason) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.OTP_VALIDED_REQUIRED_KEY,
          HttpStatus.BAD_REQUEST
        );
      }
      // Determine the value to use for verification based on the reason
      let identifier: string;
      if (reason === 'signup') {
        if (!mobile) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            API_RESPONSES.MOBILE_REQUIRED,
            HttpStatus.BAD_REQUEST
          );
        }
        identifier = this.formatMobileNumber(mobile); // Assuming this formats the mobile number
      } else if (reason === 'forgot') {
        if (!username) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            API_RESPONSES.USERNAME_REQUIRED,
            HttpStatus.BAD_REQUEST
          );
        }
        identifier = username;
      } else {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_REASON,
          HttpStatus.BAD_REQUEST
        );
      }
      const [hashValue, expires] = hash.split('.');
      if (!hashValue || !expires || isNaN(parseInt(expires))) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_HASH_FORMAT,
          HttpStatus.BAD_REQUEST
        );
      }

      if (Date.now() > parseInt(expires)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.OTP_EXPIRED,
          API_RESPONSES.OTP_EXPIRED,
          HttpStatus.BAD_REQUEST
        );
      }
      const data = `${identifier}.${otp}.${reason}.${expires}`;
      const calculatedHash = this.authUtils.calculateHash(data, this.smsKey); // Create hash

      if (calculatedHash === hashValue) {
        return await APIResponse.success(
          response,
          apiId,
          { success: true },
          HttpStatus.OK,
          API_RESPONSES.OTP_VALID
        );
      } else {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.OTP_INVALID,
          API_RESPONSES.OTP_INVALID,
          HttpStatus.BAD_REQUEST
        );
      }
    } catch (e) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error during OTP verification: ${e.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${e?.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // send Mobile Notification
  async smsNotification(
    context: string,
    key: string,
    replacements: object,
    receipients: string[]
  ) {
    try {
      //sms notification Body
      const notificationPayload = {
        isQueue: false,
        context: context,
        key: key,
        replacements: replacements,
        sms: {
          receipients: receipients.map((recipient) => recipient.toString()),
        },
      };
      // send Axios request
      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload
      );
      // Check for errors in the response
      if (
        mailSend?.result?.sms?.errors &&
        mailSend.result.sms.errors.length > 0
      ) {
        const errorMessages = mailSend.result.sms.errors.map(
          (error: { error: string }) => error.error
        );
        const combinedErrorMessage = errorMessages.join(', '); // Combine all error messages into one string
        throw new Error(`${API_RESPONSES.SMS_ERROR} :${combinedErrorMessage}`);
      }
      return mailSend;
    } catch (error) {
      LoggerUtil.error(API_RESPONSES.SMS_ERROR, error.message);
      throw new Error(
        `${API_RESPONSES.SMS_NOTIFICATION_ERROR}:  ${error.message}`
      );
    }
  }

  //send OTP on mobile and email for forgot password reset
  async sendPasswordResetOTP(
    body: SendPasswordResetOTPDto,
    response: Response
  ): Promise<any> {
    const apiId = APIID.SEND_RESET_OTP;
    try {
      const username = body.username;
      let error = [];
      let success = [];
      const userData: any = await this.findUserDetails(null, username);
      if (!userData) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.USER_NOT_EXISTS,
          HttpStatus.BAD_REQUEST
        );
      }

      if (!userData.mobile && !userData.email) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.MOBILE_EMAIL_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }
      const programName = userData?.tenantData[0]?.tenantName ?? '';
      const reason = 'forgot';
      const otp = this.authUtils.generateOtp(this.otpDigits).toString();
      const { hash, expires, expiresInMinutes } = this.generateOtpHash(
        username,
        otp,
        reason
      );
      if (userData.mobile) {
        const replacements = {
          '{OTP}': otp,
          '{otpExpiry}': expiresInMinutes,
        };
        try {
          await this.smsNotification('OTP', 'Reset_OTP', replacements, [
            userData.mobile,
          ]);
          success.push({ type: 'SMS', message: API_RESPONSES.MOBILE_SENT_OTP });
        } catch (e) {
          error.push({
            type: 'SMS',
            message: `${API_RESPONSES.MOBILE_OTP_SEND_FAILED} ${e.message}`,
          });
        }
      }
      if (userData.email) {
        const replacements = {
          '{OTP}': otp,
          '{otpExpiry}': expiresInMinutes,
          '{programName}': programName,
          '{username}': username,
        };
        try {
          await this.sendEmailNotification('OTP', 'Reset_OTP', replacements, [
            userData.email,
          ]);
          success.push({
            type: 'Email',
            message: API_RESPONSES.EMAIL_SENT_OTP,
          });
        } catch (e) {
          error.push({
            type: 'Email',
            message: `${API_RESPONSES.EMAIL_OTP_SEND_FAILED}: ${e.message}`,
          });
        }
      }
      // Error
      if (error.length === 2) {
        // if both SMS and Email notification fail to sent
        let errorMessage = '';
        if (error.some((e) => e.type === 'SMS')) {
          errorMessage += `SMS Error: ${error
            .filter((e) => e.type === 'SMS')
            .map((e) => e.message)
            .join(', ')}. `;
        }
        if (error.some((e) => e.type === 'Email')) {
          errorMessage += `Email Error: ${error
            .filter((e) => e.type === 'Email')
            .map((e) => e.message)
            .join(', ')}.`;
        }

        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOTIFICATION_ERROR,
          errorMessage.trim(),
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      const result = {
        hash: `${hash}.${expires}`,
        success: success,
        Error: error,
      };
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.SEND_OTP
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${e?.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //send Email Notification
  async sendEmailNotification(
    context: string,
    key: string,
    replacements: object,
    emailReceipt
  ) {
    try {
      //Send Notification
      const notificationPayload = {
        isQueue: false,
        context: context,
        key: key,
        replacements: replacements,
        email: {
          receipients: emailReceipt,
        },
      };
      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload
      );
      if (
        mailSend?.result?.email?.errors &&
        mailSend.result.email.errors.length > 0
      ) {
        const errorMessages = mailSend.result.email.errors.map(
          (error: { error: string }) => error.error
        );
        const combinedErrorMessage = errorMessages.join(', '); // Combine all error messages into one string
        throw new Error(`error :${combinedErrorMessage}`);
      }
      return mailSend;
    } catch (e) {
      LoggerUtil.error(API_RESPONSES.EMAIL_ERROR, e.message);
      throw new Error(
        `${API_RESPONSES.EMAIL_NOTIFICATION_ERROR}:  ${e.message}`
      );
    }
  }
}
