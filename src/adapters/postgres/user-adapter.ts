import { HttpStatus, Injectable } from "@nestjs/common";
import { User } from "../../user/entities/user-entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, ILike, In, Repository } from "typeorm";
import { tenantRoleMappingDto, UserCreateDto } from "../../user/dto/user-create.dto";
import jwt_decode from "jwt-decode";
import {
  getKeycloakAdminToken,
  createUserInKeyCloak,
  updateUserInKeyCloak,
  checkIfUsernameExistsInKeycloak,
  updateUserEnabledStatusInKeycloak,
  checkIfEmailExistsInKeycloak,
} from "../../common/utils/keycloak.adapter.util";
import { ErrorResponse } from "src/error-response";
import { SuccessResponse } from "src/success-response";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { isUUID } from "class-validator";
import { ExistUserDto, SuggestUserDto, UserSearchDto } from "src/user/dto/user-search.dto";
import { HierarchicalLocationFiltersDto } from "src/user/dto/user-hierarchical-search.dto";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UserData } from "src/user/user.controller";
import APIResponse from "src/common/responses/response";
import { Request, Response, query } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { IServicelocator } from "../userservicelocator";
import { PostgresFieldsService } from "./fields-adapter";
import { PostgresRoleService } from "./rbac/role-adapter";
import { CustomFieldsValidation } from "@utils/custom-field-validation";
import { NotificationRequest } from "@utils/notification.axios";
import { JwtUtil } from "@utils/jwt-token";
import { ConfigService } from "@nestjs/config";
import { formatTime } from "@utils/formatTimeConversion";
import { API_RESPONSES } from "@utils/response.messages";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { CohortAcademicYearService } from "./cohortAcademicYear-adapter";
import { PostgresAcademicYearService } from "./academicyears-adapter";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { AuthUtils } from "@utils/auth-util";
import { OtpSendDTO } from "src/user/dto/otpSend.dto";
import { OtpVerifyDTO } from "src/user/dto/otpVerify.dto";
import { SendPasswordResetOTPDto } from "src/user/dto/passwordReset.dto";
import { ActionType, UserUpdateDTO } from "src/user/dto/user-update.dto";
import { randomInt } from 'crypto';
import { UUID } from "aws-sdk/clients/cloudtrail";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { KafkaService } from "src/kafka/kafka.service";

interface UpdateField {
  userId: string; // Required
  firstName?: string; // Optional
  lastName?: string; // Optional
  username?: string; // Optional
  email?: string; // Optional
}
@Injectable()
export class PostgresUserService implements IServicelocator {
  axios = require("axios");
  jwt_password_reset_expires_In: any;
  jwt_secret: any;
  reset_frontEnd_url: any;
  //SMS notification
  private readonly otpExpiry: number;
  private readonly otpDigits: number;
  private readonly smsKey: string;
  private readonly dataSource: DataSource;
  private readonly msg91TemplateKey: string;

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
    private readonly authUtils: AuthUtils,
    private readonly automaticMemberService: AutomaticMemberService,
    private readonly kafkaService: KafkaService,
    dataSource: DataSource
  ) {
    this.jwt_secret = this.configService.get<string>("RBAC_JWT_SECRET");
    this.jwt_password_reset_expires_In = this.configService.get<string>(
      "PASSWORD_RESET_JWT_EXPIRES_IN"
    );
    this.reset_frontEnd_url =
      this.configService.get<string>("RESET_FRONTEND_URL");
    this.otpExpiry = this.configService.get<number>('OTP_EXPIRY') || 10; // default: 10 minutes
    this.otpDigits = this.configService.get<number>('OTP_DIGITS') || 6;
    this.smsKey = this.configService.get<string>('SMS_KEY');
    this.msg91TemplateKey = this.configService.get<string>('MSG91_TEMPLATE_KEY');
    this.dataSource = dataSource; // Store dataSource in class property
  }


  public async getCoreColumnNames() {
    const userMetadata = this.dataSource.getMetadata(User);
    const columnNames = userMetadata.columns.map((column) => column.propertyName);
    return columnNames;
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
      const capilatizeFirstLettterOfProgram = programName
        ? programName.charAt(0).toUpperCase() + programName.slice(1)
        : "Learner Account";

      //Send Notification
      const notificationPayload = {
        isQueue: false,
        context: "USER",
        key: "OnForgotPasswordReset",
        replacements: {
          "{username}": userData?.firstName + " " + userData?.lastName,
          "{resetToken}": resetToken,
          "{programName}": capilatizeFirstLettterOfProgram,
          "{expireTime}": time,
          "{frontEndUrl}": frontEndUrl,
          "{redirectUrl}": redirectUrl,
        },
        email: {
          receipients: [emailOfUser],
        },
      };

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
      } else if (e.name === "InvalidTokenError") {
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
      const findData = await this.findAllUserDetails(userSearchDto, tenantId);

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


  async findAllUserDetails(userSearchDto, tenantId?: string) {
    let { limit, offset, filters, exclude, sort } = userSearchDto;
    let excludeCohortIdes;
    let excludeUserIdes;

    offset = offset ? `OFFSET ${offset}` : "";
    limit = limit ? `LIMIT ${limit}` : "";
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
      (key) => key !== "district" && key !== "state"
    );

    if (filters && Object.keys(filters).length > 0) {
      //Fwtch all core fields
      let coreFields = await this.getCoreColumnNames();
      const allCoreField = [...coreFields, 'fromDate', 'toDate', 'role', 'tenantId', 'name'];

      for (const [key, value] of Object.entries(filters)) {
        //Check request filter are proesent on core file or cutom fields
        if (allCoreField.includes(key)) {
          if (index > 0 && index < Object.keys(filters).length) {
            whereCondition += ` AND `;
          }
          switch (key) {
            case "firstName":
            case "name":
              whereCondition += ` U."${key}" ILIKE '%${value}%'`;
              index++;
              break;

            case "status":
            case "email":
            case "username":
            case "userId":
              if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
                const status = value.map((item) => `'${item.trim().toLowerCase()}'`).join(",");
                whereCondition += ` U."${key}" IN(${status})`;
              } else {
                if (key === "username") {
                  whereCondition += ` U."${key}" ILIKE '${value}'`;
                } else {
                  whereCondition += ` U."${key}" = '${value}'`;
                }
              }
              index++;
              break;

            case "role":
              whereCondition += ` R."name" = '${value}'`;
              index++;
              break;

            case "status":
              whereCondition += ` U."status" IN('${value}')`;
              index++;

            case "fromDate":
              whereCondition += ` DATE(U."createdAt") >= '${value}'`;
              index++;
              break;

            case "toDate":
              whereCondition += ` DATE(U."createdAt") <= '${value}'`;
              index++;
              break;

            case "tenantId":
              whereCondition += `UTM."tenantId" = '${value}'`;
              index++;
              break;

            default:
              whereCondition += ` U."${key}" = '${value}'`;
              index++;
              break;
          }
        } else {
          //For custom field store the data in key value pear
          searchCustomFields[key] = value;
        }
      }
    }

    if (exclude && Object.keys(exclude).length > 0) {
      Object.entries(exclude).forEach(([key, value]) => {
        if (key == "cohortIds") {
          excludeCohortIdes = value;
        }
        if (key == "userIds") {
          excludeUserIdes = value;
        }
      });
    }

    let orderingCondition = "";
    if (sort && Object.keys(sort).length > 0) {
      orderingCondition = `ORDER BY U."${sort[0]}" ${sort[1]}`;
    }

    let getUserIdUsingCustomFields;

    //If source config in source details from fields table is not exist then return false
    if (Object.keys(searchCustomFields).length > 0) {

      const context = "USERS";
      getUserIdUsingCustomFields =
        await this.fieldsService.filterUserUsingCustomFieldsOptimized(
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
        .join(",");
      whereCondition += `${index > 0 ? " AND " : ""} U."userId" IN (${userIdsDependsOnCustomFields})`;
      index++;
    }

    const userIds =
      excludeUserIdes?.length > 0
        ? excludeUserIdes.map((userId) => `'${userId}'`).join(",")
        : null;

    const cohortIds =
      excludeCohortIdes?.length > 0
        ? excludeCohortIdes.map((cohortId) => `'${cohortId}'`).join(",")
        : null;

    if (userIds || cohortIds) {
      const userCondition = userIds ? ` U."userId" NOT IN (${userIds})` : "";
      const cohortCondition = cohortIds
        ? `CM."cohortId" NOT IN (${cohortIds})`
        : "";
      const combinedCondition = [userCondition, cohortCondition]
        .filter(String)
        .join(" AND ");
      whereCondition += (index > 0 ? " AND " : "") + combinedCondition;
    } else if (index === 0) {
      whereCondition = "";
    }

    // Apply tenant filtering conditionally if tenantId is provided from headers
    if (tenantId && tenantId.trim() !== '') {
      if (index === 0 && whereCondition === "") {
        whereCondition = `WHERE UTM."tenantId" = '${tenantId}'`;
      } else {
        whereCondition += ` AND UTM."tenantId" = '${tenantId}'`;
      }
      LoggerUtil.log(`Applying tenant filter for tenantId: ${tenantId}`, APIID.USER_LIST);
    } else {
      LoggerUtil.warn(`No tenantId provided - returning users from all tenants`, APIID.USER_LIST);
    }

    //Get user core fields data
    const query = `SELECT U."userId",U."enrollmentId", U."username",U."email", U."firstName", U."name",UTM."tenantId", U."middleName", U."lastName", U."gender", U."dob", R."name" AS role, U."mobile", U."createdBy",U."updatedBy", U."createdAt", U."updatedAt", U."status", COUNT(*) OVER() AS total_count 
      FROM  public."Users" U
      LEFT JOIN public."CohortMembers" CM 
      ON CM."userId" = U."userId"
      LEFT JOIN public."UserRolesMapping" UR
      ON UR."userId" = U."userId"
      LEFT JOIN public."UserTenantMapping" UTM
      ON UTM."userId" = U."userId"
      LEFT JOIN public."Roles" R
      ON R."roleId" = UR."roleId" ${whereCondition} GROUP BY U."userId",UTM."tenantId", R."name" ${orderingCondition} ${offset} ${limit}`;
    const userDetails = await this.usersRepository.query(query);

    if (userDetails.length > 0) {
      result.totalCount = parseInt(userDetails[0].total_count, 10);

      // Get user custom field data
      for (const userData of userDetails) {
        const customFields = await this.fieldsService.getCustomFieldDetails(
          userData.userId, 'Users'
        );

        userData["customFields"] = Array.isArray(customFields)
          ? customFields.map((data) => ({
            fieldId: data?.fieldId,
            label: data?.label,
            selectedValues: data?.selectedValues,
            type: data?.type,
          }))
          : [];

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
        userDetails["role"] = userRole.title;
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
        const context = "USERS";
        const contextType = roleInUpper;
        // customFields = await this.fieldsService.getFieldValuesData(userData.userId, context, contextType, ['All'], true);
        customFields = await this.fieldsService.getCustomFieldDetails(
          userData.userId, 'Users'
        );
      }

      result.userData = userDetails;
      result.userData["customFields"] = customFields;

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
      select: ["title", "code"],
    });
    return role;
  }

  async findUserDetails(userId, username?: any, tenantId?: string) {
    const whereClause: any = { userId: userId };
    if (username && userId === null) {
      delete whereClause.userId;
      whereClause.username = ILike(username);
    }
    const userDetails = await this.usersRepository.findOne({
      where: whereClause,
      select: [
        "userId",
        "enrollmentId",
        "username",
        "firstName",
        "name",
        "middleName",
        "lastName",
        "gender",
        "dob",
        "mobile",
        "email",
        "temporaryPassword",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
        "deviceId",
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
    userDetails["tenantData"] = tenantData;

    return userDetails;
  }

  async userTenantRoleData(userId: string) {
    const query = `
  SELECT 
    T."tenantId", 
    T."templateId",
    T."contentFramework",
    T."collectionFramework",
    T."channelId",
    T.name AS tenantName, 
    T.params,
    T."type",
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
    const tenantMap = new Map();

    for (const data of result) {
      const roleData = await this.postgresRoleService.findUserRoleData(
        userId,
        data.tenantId
      );

      if (roleData.length > 0) {
        const tenantId = data.tenantId;
        
        // If tenant already exists in map, just add roles to existing entry
        if (tenantMap.has(tenantId)) {
          const existingTenant = tenantMap.get(tenantId);
          roleData.forEach(role => {
            // Avoid duplicate roles
            const roleExists = existingTenant.roles.some(existingRole => 
              existingRole.roleId === role.roleid
            );
            if (!roleExists) {
              existingTenant.roles.push({
                roleId: role.roleid,
                roleName: role.title,
              });
            }
          });
        } else {
          // Create new tenant entry with all roles
          const roles = roleData.map(role => ({
            roleId: role.roleid,
            roleName: role.title,
          }));

          tenantMap.set(tenantId, {
            tenantName: data.tenantname,
            tenantId: tenantId,
            templateId: data.templateId,
            contentFramework: data.contentFramework,
            collectionFramework: data.collectionFramework,
            channelId: data.channelId,
            userTenantMappingId: data.usertenantmappingid,
            params: data.params,
            roles: roles,
            tenantType: data.type,
          });
        }
      }
    }

    return Array.from(tenantMap.values());
  }

  async updateUser(userDto, response: Response) {
    const apiId = APIID.USER_UPDATE;
    try {
      const updatedData = {};
      const editIssues = {};

      const user = await this.usersRepository.findOne({ where: { userId: userDto.userId } });
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
          deviceIds = await this.loginDeviceIdAction(userDto.userData.deviceId, userDto.userId, user.deviceId)
          userDto.userData.deviceId = deviceIds;

        } else if (userDto.userData.action === ActionType.REMOVE) {
          //remove deviceId
          deviceIds = await this.onLogoutDeviceId(userDto.userData.deviceId, userDto.userId, user.deviceId)
          userDto.userData.deviceId = deviceIds;
        }
      }

      const { username, firstName, lastName, email } = userDto.userData;
      const userId = userDto.userId;
      const keycloakReqBody = { username, firstName, lastName, userId, email };

      //Update userdetails on keycloak
      if (username || firstName || lastName || email) {
        try {
          const keycloakUpdateResult = await this.updateUsernameInKeycloak(keycloakReqBody);

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
        updatedData["basicDetails"] = userDto.userData;
      }

      LoggerUtil.log(
        API_RESPONSES.USER_BASIC_DETAILS_UPDATE,
        apiId,
        userDto?.userId
      );


      // Synchronize user status with Keycloak
      if (userDto.userData?.status) {
        const isUserActive = userDto.userData.status === 'active';
        
        // Async Keycloak status synchronization - non-blocking
        this.syncUserStatusWithKeycloak(userDto.userId, isUserActive, apiId)
          .catch(error => LoggerUtil.error(
            'Keycloak user status sync failed',
            `Error: ${error.message}`,
            apiId
          ));
      }

      if (userDto?.customFields?.length > 0) {
        const getFieldsAttributes =
          await this.fieldsService.getEditableFieldsAttributes(userDto.userData.tenantId);

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
              if (!updatedData["customFields"])
                updatedData["customFields"] = [];
              updatedData["customFields"].push(result);
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
          editIssues["uneditableFields"] = unEditableIdes;
        }
        if (editFailures.length > 0) {
          editIssues["editFieldsFailure"] = editFailures;
        }
      }

      if (userDto.automaticMember && userDto?.automaticMember?.value === true) {

        let assignTo;
        //Find Assign field value from custom fields
        let foundField = userDto.customFields.find(field => field.fieldId === userDto.automaticMember.fieldId);
        if (foundField) {
          assignTo = foundField.value;
        }

        // Check if an active automated member exists for the given userId, tenantId, and assigned ID.
        const checkAutomaticMemberExists = await this.automaticMemberService.checkAutomaticMemberExists(userId, userDto.userData.tenantId, foundField.value[0]);

        if (checkAutomaticMemberExists.length > 0 && checkAutomaticMemberExists[0].isActive === true) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `User already assign to that ${userDto.automaticMember.fieldName}`, // which uuid is needed ?
            HttpStatus.BAD_REQUEST
          );
        }


        if (checkAutomaticMemberExists.length > 0 && checkAutomaticMemberExists[0].isActive === false) {
          // deactivate the current active automatic membership for the user in tenantId.
          const getActiveAutomaticMembershipId = await this.automaticMemberService.getUserbyUserIdAndTenantId(userId, userDto.userData.tenantId, true);

          if (getActiveAutomaticMembershipId && getActiveAutomaticMembershipId.isActive === true) {
            await this.automaticMemberService.update(getActiveAutomaticMembershipId.id, { isActive: false })
          }

          // Activate the old inactive automatic membership for the user in tenantId and assigned ID.
          await this.automaticMemberService.update(checkAutomaticMemberExists[0].id, { isActive: true })
          return await APIResponse.success(
            response,
            apiId,
            { ...updatedData, editIssues },
            HttpStatus.OK,
            API_RESPONSES.USER_UPDATED_SUCCESSFULLY
          );
        }

        await this.updateAutomaticMemberMapping(userDto.automaticMember, assignTo, userId, userDto.userData.tenantId)
      }

      LoggerUtil.log(
        API_RESPONSES.USER_UPDATED_SUCCESSFULLY,
        apiId,
        userDto?.userId
      );

      // Send response to the client
      const apiResponse = await APIResponse.success(
        response,
        apiId,
        { ...updatedData, editIssues },
        HttpStatus.OK,
        API_RESPONSES.USER_UPDATED_SUCCESSFULLY
      );

      // Produce user updated event to Kafka asynchronously - after response is sent to client
      this.publishUserEvent('updated', userDto.userId, apiId)
        .catch(error => LoggerUtil.error(
          `Failed to publish user updated event to Kafka`,
          `Error: ${error.message}`,
          apiId
        ));

      return apiResponse;
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
  checkAutomaticMemberExists(userId: any, tenantId: any, arg2: any) {
    throw new Error("Method not implemented.");
  }

  async updateAutomaticMemberMapping(automaticMember: any, fieldValue: any, userId: UUID, tenantId: UUID) {

    try {
      // deactivate the current active automatic membership for the user in tenantId.
      const getActiveAutomaticMembershipId = await this.automaticMemberService.getUserbyUserIdAndTenantId(userId, tenantId, true);

      if (getActiveAutomaticMembershipId && getActiveAutomaticMembershipId.isActive === true) {
        await this.automaticMemberService.update(getActiveAutomaticMembershipId.id, { isActive: false })
      }

      let createAutomaticMember = {
        userId: userId,
        rules: {
          condition: {
            value: fieldValue,
            fieldId: automaticMember.fieldId,
            // "operator": "="
          },
          cohortField: automaticMember.fieldName,
          // allowedActions: {
          //   user: ["create","view", "edit", "delete"],
          //   cohort: ["create","view", "edit", "delete"]
          // }
        },
        tenantId: tenantId,
        isActive: true
      }

      //Assgn member to sdb
      await this.automaticMemberService.create(createAutomaticMember)

    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`
      );
      throw new Error(error);
    }
  }

  async updateUsernameInKeycloak(updateField: UpdateField): Promise<'exists' | false | true> {
    try {

      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      //Check user is exist in keycloakDB or not
      const checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(updateField);
      if (checkUserinKeyCloakandDb) {
        return 'exists';
      }

      //Update user in keyCloakService
      let updateResult = await updateUserInKeyCloak(updateField, token)
      if (updateResult.success === false) {
        return false;
      }
      return true;

    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `KeyCloak Error: ${error.message}`,
      );
      return false;
    }
  }


  private async syncUserStatusWithKeycloak(userId: string, isActive: boolean, apiId: string): Promise<void> {
    try {
      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      const result = await updateUserEnabledStatusInKeycloak(
        { userId, enabled: isActive },
        token
      );

      if (result.success) {
        LoggerUtil.log(
          `Keycloak user status synchronized successfully: ${isActive ? 'enabled' : 'disabled'}`,
          apiId,
          userId
        );
      } else {
        LoggerUtil.error(
          'Keycloak user status synchronization failed',
          `Status: ${result.statusCode}, Message: ${result.message}`,
          apiId
        );
      }
    } catch (error) {
      LoggerUtil.error(
        'Keycloak user status synchronization error',
        `Failed to sync user status: ${error.message}`,
        apiId
      );
      throw error;
    }
  }

  async loginDeviceIdAction(userDeviceId: string, userId: string, existingDeviceId: string[]): Promise<string[]> {
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

  async onLogoutDeviceId(deviceIdforRemove: string, userId: string, existingDeviceId: string[]) {
    let deviceIds = existingDeviceId || [];
    // Check if the device ID exists
    if (!deviceIds.includes(deviceIdforRemove)) {
      return deviceIds; // No action if device ID does not exist
    }
    // Remove the device ID
    deviceIds = deviceIds.filter(id => id !== deviceIdforRemove);
    return deviceIds;
  }

  async updateBasicUserDetails(userId: string, userData: Partial<User>): Promise<User | null> {
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
    const startTime = Date.now();
    const stepTimings = {};

    const userContext = {
      username: userCreateDto?.username,
      email: userCreateDto?.email,
      firstName: userCreateDto?.firstName,
      lastName: userCreateDto?.lastName
    };

    // Log user creation attempt with context
    LoggerUtil.log(
      `User creation attempt started for ${userContext.username}`,
      apiId,
      userContext.username
    );

    try {
      // Step 1: Extract user info from JWT token
      const jwtStartTime = Date.now();
      if (request.headers.authorization) {
        const decoded: any = jwt_decode(request.headers.authorization);
        userCreateDto.createdBy = decoded?.sub;
        userCreateDto.updatedBy = decoded?.sub;
      }
      stepTimings['jwt_extraction'] = Date.now() - jwtStartTime;

      // Step 2: Validate custom fields
      const customFieldStartTime = Date.now();
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
      stepTimings['custom_field_validation'] = Date.now() - customFieldStartTime;

      // Step 3: Validate request body and roles
      const validationStartTime = Date.now();
      const validatedRoles: any = await this.validateRequestBody(
        userCreateDto,
        academicYearId
      );

      // check if roles are invalid and academic year is provided
      if (
        Array.isArray(validatedRoles) &&
        validatedRoles.some((item) => item?.code === undefined)
      ) {
        LoggerUtil.error(
          `Role validation failed for ${userContext.username}`,
          validatedRoles.join("; "),
          apiId,
          userContext.username
        );
        return APIResponse.error(
          response,
          apiId,
          "BAD_REQUEST",
          validatedRoles.join("; "),
          HttpStatus.BAD_REQUEST
        );
      }
      stepTimings['request_validation'] = Date.now() - validationStartTime;

      // Step 4: Validate automatic member vs cohort assignment
      const businessLogicStartTime = Date.now();
      if (userCreateDto.automaticMember?.value === true && userCreateDto.tenantCohortRoleMapping?.[0]?.cohortIds?.length > 0) {
        LoggerUtil.error(
          `Invalid operation for ${userContext.username}: Cannot assign automatic member with cohort`,
          `User cannot be assigned as automatic member while also being assigned to a center`,
          apiId,
          userContext.username
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          `Error : Invalid operation: A user cannot be assigned as an automatic member while also being assigned to a center simultaneously. Please select only one option.`,
          HttpStatus.BAD_REQUEST
        );
      }
      stepTimings['business_logic_validation'] = Date.now() - businessLogicStartTime;

      // Step 5: Prepare username and check Keycloak
      const keycloakCheckStartTime = Date.now();
      userCreateDto.username = userCreateDto.username;
      const userSchema = new UserCreateDto(userCreateDto);

      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;
      const checkUserinKeyCloakandDb = await this.checkUserinKeyCloakandDb(
        userCreateDto
      );

      if (checkUserinKeyCloakandDb) {
        LoggerUtil.error(
          `User ${userContext.username} already exists`,
          `User with username ${userCreateDto.username} or email ${userCreateDto.email} already exists`,
          apiId,
          userContext.username
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.USER_EXISTS,
          HttpStatus.BAD_REQUEST
        );
      }
      stepTimings['keycloak_user_check'] = Date.now() - keycloakCheckStartTime;

      // Step 6: Create user in Keycloak
      const keycloakCreateStartTime = Date.now();
      LoggerUtil.log(
        `Creating user ${userContext.username} in Keycloak`,
        apiId,
        userContext.username
      );

      const resKeycloak = await createUserInKeyCloak(userSchema, token, validatedRoles[0]?.title)

      // Capture Keycloak creation timing immediately after the call
      stepTimings['keycloak_user_creation'] = Date.now() - keycloakCreateStartTime;

      // Handle the case where createUserInKeyCloak returns a string (error)
      if (typeof resKeycloak === 'string') {
        LoggerUtil.error(
          `Keycloak user creation failed for ${userContext.username}`,
          resKeycloak,
          apiId,
          userContext.username
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.SERVER_ERROR,
          resKeycloak,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      if (resKeycloak.statusCode !== 201) {
        if (resKeycloak.statusCode === 409) {
          LoggerUtil.error(
            `Email already exists in Keycloak for ${userContext.username}`,
            `${resKeycloak.message} ${resKeycloak.email}`,
            apiId,
            userContext.username
          );

          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.EMAIL_EXIST,
            `${resKeycloak.message} ${resKeycloak.email}`,
            HttpStatus.CONFLICT
          );
        } else {
          LoggerUtil.error(
            `Keycloak user creation failed for ${userContext.username}`,
            `${resKeycloak.message}`,
            apiId,
            userContext.username
          );
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.SERVER_ERROR,
            `${resKeycloak.message}`,
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }
      }

      LoggerUtil.log(
        `User ${userContext.username} created successfully in Keycloak`,
        apiId,
        userContext.username
      );

      userCreateDto.userId = resKeycloak.userId;

      // Step 7: Create user in database
      const dbCreateStartTime = Date.now();
      LoggerUtil.log(
        `Creating user ${userContext.username} in database`,
        apiId,
        userContext.username
      );

      const result = await this.createUserInDatabase(
        request,
        userCreateDto,
        academicYearId,
        response
      );
      stepTimings['database_user_creation'] = Date.now() - dbCreateStartTime;

      LoggerUtil.log(
        `User ${userContext.username} created successfully in database`,
        apiId,
        userContext.username
      );

      // Step 8: Handle custom fields
      const customFieldsStartTime = Date.now();
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
          "USERS",
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
              fieldId: fieldValues["fieldId"],
              value: fieldValues["value"],
            };

            const res = await this.fieldsService.updateUserCustomFields(
              userId,
              fieldData,
              customFieldAttributes[fieldData.fieldId]
            );

            // if (res.correctValue) {
            //   if (!result["customFields"]) result["customFields"] = [];
            //   result["customFields"].push(res);
            // } else {
            //   createFailures.push(
            //     `${fieldData.fieldId}: ${res?.valueIssue} - ${res.fieldName}`
            //   );
            // }
          }
        }
      }
      stepTimings['custom_fields_processing'] = Date.now() - customFieldsStartTime;

      // Step 9: Log performance metrics
      const totalTime = Date.now() - startTime;
      LoggerUtil.log(
        `User ${userContext.username} created successfully with ID: ${result.userId}`,
        apiId,
        userContext.username
      );

      // Log performance breakdown
      LoggerUtil.log(
        `Performance breakdown for user creation (${userContext.username}): Total: ${totalTime}ms | JWT: ${stepTimings['jwt_extraction']}ms | Custom Fields Validation: ${stepTimings['custom_field_validation']}ms | Request Validation: ${stepTimings['request_validation']}ms | Business Logic: ${stepTimings['business_logic_validation']}ms | Keycloak Check: ${stepTimings['keycloak_user_check']}ms | Keycloak Creation: ${stepTimings['keycloak_user_creation']}ms | Database Creation: ${stepTimings['database_user_creation']}ms | Custom Fields Processing: ${stepTimings['custom_fields_processing']}ms`,
        apiId,
        userContext.username
      );

      // Send response to the client
      APIResponse.success(
        response,
        apiId,
        { userData: { ...result, createFailures } },
        HttpStatus.CREATED,
        API_RESPONSES.USER_CREATE_SUCCESSFULLY
      );

      // Produce user created event to Kafka asynchronously - after response is sent to client
      this.publishUserEvent('created', result.userId, apiId)
        .catch(error => LoggerUtil.error(
          `Failed to publish user created event to Kafka for ${userContext.username}`,
          `Error: ${error.message}`,
          apiId,
          userContext.username
        ));
    } catch (e) {

      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}: ${request.url}`,
        `Error: ${e.message}`,
        apiId,
        userContext.username
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
        return errors.join("; ");
      },
    };
  }

  async validateRequestBody(userCreateDto, academicYearId) {
    const errorCollector = this.createErrorCollector();
    let roleData: any[] = [];
    const duplicateTenet = [];

    const error = [];
    for (const [key, value] of Object.entries(userCreateDto)) {
      if (key === "email") {
        const checkValidEmail = CustomFieldsValidation.validate(
          "email",
          userCreateDto.email
        );
        if (!checkValidEmail) {
          errorCollector.addError(`Invalid email address`);
        }
      }

      if (key === "mobile") {
        const checkValidMobile = CustomFieldsValidation.validate(
          "mobile",
          userCreateDto.mobile
        );
        if (!checkValidMobile) {
          errorCollector.addError(`Mobile number must be 10 digits long`);
        }
      }

      if (key === "dob") {
        const checkValidDob = CustomFieldsValidation.validate(
          "date",
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
            "Academic Year ID is required when a Cohort ID is provided."
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

        // if ((tenantId && !roleId) || (!tenantId && roleId)) {
        //   errorCollector.addError(API_RESPONSES.INVALID_PARAMETERS);
        // }

        const [tenantExists, notExistCohort, roleExists] = await Promise.all([
          tenantId
            ? this.tenantsRepository.find({ where: { tenantId } })
            : Promise.resolve([]),
          tenantId && cohortIds
            ? this.checkCohortExistsInAcademicYear(academicYearId, cohortIds)
            : Promise.resolve([]),
          roleId
            ? this.roleRepository.find({ where: { roleId } })
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
            `Role Id '${roleId}' does not exist.`
          );
        } else if (roleExists) {
          if ((roleExists[0].tenantId || roleExists[0].tenantId !== null) && roleExists[0].tenantId !== tenantId) {
            errorCollector.addError(
              `Role Id '${roleId}' does not exist for this tenant '${tenantId}'.`
            );
          } else {
            roleData = [...roleData, ...roleExists];
          }
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


  // Can be Implemented after we know what are the unique entities
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
    academicYearId?: string,
    response?: Response
  ): Promise<User> {
    const user = new User();
    user.userId = userCreateDto?.userId,
      user.username = userCreateDto?.username,
      user.firstName = userCreateDto?.firstName,
      user.middleName = userCreateDto?.middleName,
      user.lastName = userCreateDto?.lastName,
      user.gender = userCreateDto?.gender,
      user.email = userCreateDto?.email,
      user.mobile = Number(userCreateDto?.mobile) || null,
      user.createdBy = userCreateDto?.createdBy || userCreateDto?.createdBy;

    if (userCreateDto?.dob) {
      user.dob = new Date(userCreateDto.dob);
    }
    const result = await this.usersRepository.save(user);
    const createdBy = request.user?.userId || result.userId;

    if (userCreateDto.tenantCohortRoleMapping) {
      if (userCreateDto.automaticMember && userCreateDto?.automaticMember?.value === true) {
        await this.automaticMemberMapping(userCreateDto.automaticMember, userCreateDto.customFields, userCreateDto.tenantCohortRoleMapping, result.userId, createdBy)
      } else {
        await this.tenantCohortRollMapping(userCreateDto.tenantCohortRoleMapping, academicYearId, result.userId, createdBy);
      }
    }
    return result;
  }

  async tenantCohortRollMapping(tenantCohortRoleMapping: tenantRoleMappingDto[], academicYearId: UUID, userId: UUID, createdBy: UUID): Promise<void> {
    try {
      for (const mapData of tenantCohortRoleMapping) {
        if (mapData.cohortIds) {
          for (const cohortIds of mapData.cohortIds) {
            let query = `SELECT * FROM public."CohortAcademicYear" WHERE "cohortId"= '${cohortIds}' AND "academicYearId" = '${academicYearId}'`;

            let getCohortAcademicYearId = await this.usersRepository.query(
              query
            );

            // will add data only if cohort is found with academic year
            let cohortData = {
              userId: userId,
              cohortId: cohortIds,
              cohortAcademicYearId:
                getCohortAcademicYearId[0]["cohortAcademicYearId"] || null,
            };
            await this.addCohortMember(cohortData);
          }
        }

        const tenantRoleMappingData = {
          userId: userId,
          tenantRoleMapping: mapData,
        };

        await this.assignUserToTenantAndRoll(tenantRoleMappingData, createdBy);
      }
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`
      );
      throw new Error(error);
    }
  }


  async automaticMemberMapping(automaticMember: any, customFields: any, tenantCohortRoleMapping: tenantRoleMappingDto[], userId: UUID, createdBy: UUID): Promise<void> {

    try {
      // Tenant and role mapping
      for (const mapData of tenantCohortRoleMapping) {
        const tenantRoleMappingData = {
          userId: userId,
          tenantRoleMapping: mapData,
        };
        await this.assignUserToTenantAndRoll(tenantRoleMappingData, createdBy);
      }
      let fieldValue;
      let foundField = customFields.find(field => field.fieldId === automaticMember.fieldId);
      if (foundField) {
        fieldValue = foundField.value;
      }

      let createAutomaticMember = {
        userId: userId,
        rules: {
          condition: {
            value: fieldValue,
            fieldId: automaticMember.fieldId,
            // "operator": "="
          },
          cohortField: automaticMember.fieldName,
          // allowedActions: {
          //   user: ["create","view", "edit", "delete"],
          //   cohort: ["create","view", "edit", "delete"]
          // }
        },
        tenantId: tenantCohortRoleMapping[0].tenantId,
        isActive: true
      }

      //Assgn member to sdb
      await this.automaticMemberService.create(createAutomaticMember)
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`
      );
      throw new Error(error);
    }
  }


  async assignUserToTenantAndRoll(tenantsData, createdBy) {
    try {
      const tenantId = tenantsData?.tenantRoleMapping?.tenantId;
      const userId = tenantsData?.userId;
      const roleId = tenantsData?.tenantRoleMapping?.roleId;

      if (roleId) {
        const data = await this.userRoleMappingRepository.save({
          userId: userId,
          tenantId: tenantId,
          roleId: roleId,
          createdBy: createdBy,
        });
      }

      if (tenantId) {
        const data = await this.userTenantMappingRepository.save({
          userId: userId,
          tenantId: tenantId,
          createdBy: createdBy,
        });
      }

      LoggerUtil.log(API_RESPONSES.USER_TENANT);
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
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
          context: "USER",
          key: "OnPasswordReset",
          replacements: {
            "{username}": userData?.name,
            "{programName}": userData?.tenantData?.[0]?.tenantName
              ? userData.tenantData[0].tenantName.charAt(0).toUpperCase() +
              userData.tenantData[0].tenantName.slice(1)
              : "",
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
        errorCode: "400",
        errorMessage: apiResponse.errors,
      });
    }
  }

  public async validateCustomField(userCreateDto, response, apiId) {
    // Taking Consideration of One tenant id
    const tenantId = userCreateDto.tenantCohortRoleMapping[0]?.tenantId;
    const fieldValues = userCreateDto ? userCreateDto.customFields : [];
    const encounteredKeys = [];
    const invalidateFields = [];
    const duplicateFieldKeys = [];
    let error = "";
    for (const fieldsData of fieldValues) {
      const fieldId = fieldsData["fieldId"];
      const getFieldDetails: any = await this.fieldsService.getFieldByIds(
        fieldId
      );

      if (getFieldDetails == null) {
        return API_RESPONSES.FIELD_NOT_FOUND;
      }

      if (encounteredKeys.includes(fieldId)) {
        duplicateFieldKeys.push(`${fieldId} - ${getFieldDetails["name"]}`);
      } else {
        encounteredKeys.push(fieldId);
      }
      const fieldAttributes = getFieldDetails?.fieldAttributes || {};
      // getFieldDetails["fieldAttributes"] = fieldAttributes[tenantId] || fieldAttributes["default"];
      getFieldDetails["fieldAttributes"] = fieldAttributes;

      if (
        (getFieldDetails.type == "checkbox" ||
          getFieldDetails.type == "drop_down" ||
          getFieldDetails.type == "radio") &&
        getFieldDetails?.sourceDetails?.source == "table"
      ) {
        let fieldValue = fieldsData["value"][0];
        const getOption = await this.fieldsService.findDynamicOptions(
          getFieldDetails.sourceDetails.table,
          `"${getFieldDetails?.sourceDetails?.table}_id"='${fieldValue}'`,
        );
        if (!getOption?.length) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            API_RESPONSES.UUID_VALIDATION, // which uuid is needed ?
            HttpStatus.BAD_REQUEST
          );
        }
        const transformedFieldParams = {
          options: getOption.flatMap((param) => {
            return Object.keys(param)
              .filter((key) => key.endsWith("_id"))
              .map((idKey) => {
                const nameKey = idKey.replace("_id", "_name");
                return {
                  value: param[idKey],
                  label: param[nameKey] || "Unknown",
                };
              });
          }),
        };

        getFieldDetails["fieldParams"] = transformedFieldParams;
        // getFieldDetails['fieldParams'] = getOption
      } else {
        getFieldDetails["fieldParams"] = getFieldDetails?.fieldParams || {};
      }
      const checkValidation = this.fieldsService.validateFieldValue(
        getFieldDetails,
        fieldsData["value"]
      );

      if (typeof checkValidation === "object" && "error" in checkValidation) {
        invalidateFields.push(
          `${fieldId}: ${getFieldDetails["name"]} - ${checkValidation?.error?.message}`
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
        select: ["title"],
      });
      contextType = getRoleName
        .map((role) => role?.title.toUpperCase())
        .join(", ");
    }

    const context = "USERS";
    const getFieldIds = await this.fieldsService.getFieldIds(
      context,
      contextType
    );

    const validFieldIds = new Set(getFieldIds.map((field) => field.fieldId));

    const invalidFieldIds = userCreateDto.customFields
      .filter((fieldValue) => !validFieldIds.has(fieldValue.fieldId))
      .map((fieldValue) => fieldValue.fieldId);

    if (invalidFieldIds.length > 0) {
      // Log the invalid field validation error with role context
      LoggerUtil.error(
        `Invalid custom fields provided for role`,
        `Role: ${contextType || 'Unknown'}, Invalid Field IDs: ${invalidFieldIds.join(", ")}, User: ${userCreateDto.username || 'Unknown'}`,
        apiId,
        userCreateDto.username
      );
      return `The following fields are not valid for this user: ${invalidFieldIds.join(
        ", "
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

      // Prepare and format user data for Kafka event
      const kafkaUserData = {
        userId: userId,
        deletedAt: new Date().toISOString()
      };

      // Send response to the client
      const apiResponse = await APIResponse.success(
        response,
        apiId,
        userResult,
        HttpStatus.OK,
        API_RESPONSES.USER_RELATEDENTITY_DELETE
      );

      // Produce user deleted event to Kafka asynchronously - after response is sent to client
      this.publishUserEvent('deleted', userId, apiId)
        .catch(error => LoggerUtil.error(
          `Failed to publish user deleted event to Kafka`,
          `Error: ${error.message}`,
          apiId
        ));
      return apiResponse;
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
  private generateOtpHash(mobileOrUsername: string, otp: string, reason: string) {
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
      const { notificationPayload, hash, expires } = await this.sendOTPOnMobile(mobile, reason);
      // Step 2: Send success response
      const result = {
        data: {
          message: `OTP sent to ${mobile}`,
          hash: `${hash}.${expires}`,
          sendStatus: notificationPayload.result?.sms?.data[0]
          // sid: message.sid, // Twilio Message SID
        }
      };
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.OTP_SEND_SUCCESSFULLY
      );
    }
    catch (e) {
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
      const { hash, expires, expiresInMinutes } = this.generateOtpHash(mobileWithCode, otp, reason);
      const replacements = {
        "{OTP}": otp,
        "{otpExpiry}": expiresInMinutes
      };
      // Step 2:send SMS notification
      const notificationPayload = await this.smsNotification("OTP", "SEND_OTP", replacements, [mobile]);
      return { notificationPayload, hash, expires, expiresInMinutes };
    }
    catch (error) {
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }
  //verify OTP based on reason [signup , forgot]
  async verifyOtp(body: OtpVerifyDTO, response: Response) {
    const apiId = APIID.VERIFY_OTP;
    try {
      const { mobile, otp, hash, reason, username } = body;

      // Validate required fields for all requests
      if (!otp || !hash || !reason) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.OTP_VALIDED_REQUIRED_KEY,
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate hash format
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

      // Check for OTP expiration
      if (Date.now() > parseInt(expires)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.OTP_EXPIRED,
          API_RESPONSES.OTP_EXPIRED,
          HttpStatus.BAD_REQUEST
        );
      }

      let identifier: string;
      let resetToken: string | null = null;

      // Process based on reason
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
        identifier = this.formatMobileNumber(mobile);
      }
      else if (reason === 'forgot') {
        if (!username) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            API_RESPONSES.USERNAME_REQUIRED,
            HttpStatus.BAD_REQUEST
          );
        }

        identifier = this.formatMobileNumber(mobile);
        const userData = await this.findUserDetails(null, username);

        if (!userData) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.NOT_FOUND,
            API_RESPONSES.USERNAME_NOT_FOUND,
            HttpStatus.NOT_FOUND
          );
        }

        // Generate reset token for forgot password flow
        const tokenPayload = {
          sub: userData.userId,
          email: userData.email,
        };

        resetToken = await this.jwtUtil.generateTokenForForgotPassword(
          tokenPayload,
          this.jwt_password_reset_expires_In,
          this.jwt_secret
        );
      }
      else {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_REASON,
          HttpStatus.BAD_REQUEST
        );
      }

      // Verify OTP hash
      const data = `${identifier}.${otp}.${reason}.${expires}`;
      const calculatedHash = this.authUtils.calculateHash(data, this.smsKey);
      if (calculatedHash === hashValue) {
        // For forgot password flow, include the reset token in response
        const responseData = { success: true };
        if (reason === 'forgot' && resetToken) {
          responseData['token'] = resetToken;
        }

        return APIResponse.success(
          response,
          apiId,
          responseData,
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
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error during OTP verification: ${error.message}`,
        apiId
      );

      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        `Error : ${error?.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


  // send Mobile Notification
  async smsNotification(context: string, key: string, replacements: object, receipients: string[]) {
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
      if (mailSend?.result?.sms?.errors && mailSend.result.sms.errors.length > 0) {
        const errorMessages = mailSend.result.sms.errors.map((error: { error: string; }) => error.error);
        const combinedErrorMessage = errorMessages.join(", "); // Combine all error messages into one string
        throw new Error(`${API_RESPONSES.SMS_ERROR} :${combinedErrorMessage}`);
      }
      return mailSend;
    }
    catch (error) {
      LoggerUtil.error(API_RESPONSES.SMS_ERROR, error.message);
      throw new Error(`${API_RESPONSES.SMS_NOTIFICATION_ERROR}:  ${error.message}`);
    }
  }

  //send OTP on mobile and email for forgot password reset
  async sendPasswordResetOTP(body: SendPasswordResetOTPDto, response: Response): Promise<any> {
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
      const reason = "forgot";
      const otp = this.authUtils.generateOtp(this.otpDigits).toString();
      const { hash, expires, expiresInMinutes } = this.generateOtpHash(username, otp, reason);
      if (userData.mobile) {
        const replacements = {
          "{OTP}": otp,
          "{otpExpiry}": expiresInMinutes
        };
        try {
          await this.smsNotification("OTP", "Reset_OTP", replacements, [userData.mobile]);
          success.push({ type: 'SMS', message: API_RESPONSES.MOBILE_SENT_OTP });
        } catch (e) {
          error.push({ type: 'SMS', message: `${API_RESPONSES.MOBILE_OTP_SEND_FAILED} ${e.message}` })
        }
      }

      if (userData.email) {
        const replacements = {
          "{OTP}": otp,
          "{otpExpiry}": expiresInMinutes,
          "{programName}": programName,
          "{username}": username
        };
        try {
          await this.sendEmailNotification("OTP", "Reset_OTP", replacements, [userData.email]);
          success.push({ type: 'Email', message: API_RESPONSES.EMAIL_SENT_OTP })
        } catch (e) {
          error.push({ type: 'Email', message: `${API_RESPONSES.EMAIL_OTP_SEND_FAILED}: ${e.message}` })
        }
      }
      // Error 
      if (error.length === 2) { // if both SMS and Email notification fail to sent
        let errorMessage = '';
        if (error.some(e => e.type === 'SMS')) {
          errorMessage += `SMS Error: ${error.filter(e => e.type === 'SMS').map(e => e.message).join(", ")}. `;
        }
        if (error.some(e => e.type === 'Email')) {
          errorMessage += `Email Error: ${error.filter(e => e.type === 'Email').map(e => e.message).join(", ")}.`;
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
        Error: error
      }
      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.SEND_OTP
      );
    }
    catch (e) {
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
  async sendEmailNotification(context: string, key: string, replacements: object, emailReceipt) {
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
      // console.log("notificationPayload",notificationPayload);

      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload
      );
      if (mailSend?.result?.email?.errors && mailSend.result.email.errors.length > 0) {
        const errorMessages = mailSend.result.email.errors.map((error: { error: string; }) => error.error);
        const combinedErrorMessage = errorMessages.join(", "); // Combine all error messages into one string
        throw new Error(`error :${combinedErrorMessage}`);
      }
      return mailSend;
    }
    catch (e) {
      LoggerUtil.error(API_RESPONSES.EMAIL_ERROR, e.message);
      throw new Error(`${API_RESPONSES.EMAIL_NOTIFICATION_ERROR}:  ${e.message}`);
    }
  }

  async sendOtpOnMail(email: string, username: string, reason: string) {
    try {
      // Step 1: Generate OTP and hash
      const otp = this.authUtils.generateOtp(this.otpDigits).toString();
      const { hash, expires, expiresInMinutes } = this.generateOtpHash(email, otp, reason);

      // Step 2: Get program name from user's tenant data
      const userData: any = await this.findUserDetails(null, username);
      const programName = userData?.tenantData?.[0]?.tenantName ?? 'Shiksha Graha';

      // Step 3: Prepare email replacements
      const replacements = {
        "{OTP}": otp,
        "{otpExpiry}": expiresInMinutes,
        "{programName}": programName,
        "{username}": username,
        "{eventName}": "Shiksha Graha OTP",
        "{action}": "register"
      };
      // console.log("hii",replacements,email)

      // Step 4: Send email notification
      const notificationPayload = await this.sendEmailNotification("OTP", "SendOtpOnMail", replacements, [email]);

      return { notificationPayload, hash, expires, expiresInMinutes };
    }
    catch (error) {
      throw new Error(`Failed to send OTP via email: ${error.message}`);
    }
  }

  async checkUser(
    request: any,
    response: any,
    filters: ExistUserDto
  ) {
    const apiId = APIID.USER_LIST;
    try {
      const whereClause: any = {};

      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (key === 'firstName' || key === 'name' || key === 'middleName' || key === 'lastName') {
              const sanitizedValue = this.sanitizeInput(value);
              whereClause[key] = ILike(`%${sanitizedValue}%`);
            } else if (key === 'username') {
              const sanitizedValue = this.sanitizeInput(value);
              whereClause[key] = ILike(sanitizedValue);
            } else {
              whereClause[key] = this.sanitizeInput(value);
            }
          }
        });
      }
      // Use the dynamic where clause to fetch matching data
      const findData = await this.usersRepository.find({
        where: whereClause,
        select: ['username', 'firstName', 'name', 'middleName', 'lastName', 'mobile'], // Select only these fields
      });

      if (findData.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.USER_NOT_FOUND,
          API_RESPONSES.NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

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
  sanitizeInput(value) {
    if (typeof value === 'string') {
      // Escape special characters for SQL
      return value.replace(/[%_\\]/g, '\\$&');
    }
    // For other types, return the value as is or implement specific sanitization logic
    return value;
  }


  async suggestUsername(request: Request, response: Response, suggestUserDto: SuggestUserDto) {
    const apiId = APIID.USER_LIST;
    try {
      // Fetch user data from the database to check if the username already exists
      const findData = await this.usersRepository.findOne({
        where: { username: ILike(suggestUserDto?.username) },
      });

      if (findData) {
        // Define a function to generate a username  
        const generateUsername = (): string => {
          const randomNum = randomInt(100, 1000); // Secure random 3-digit number
          return `${suggestUserDto.firstName}${suggestUserDto.lastName}${randomNum}`;
        };

        // Check if the generated username exists in the database
        let newUsername = generateUsername();
        let isUnique = false;

        while (!isUnique) {
          const existingUser = await this.usersRepository.findOne({
            where: { username: ILike(newUsername) },
          });

          if (!existingUser) {
            isUnique = true; // Username is unique
          } else {
            // Generate a new username and try again
            newUsername = generateUsername();
          }
        }

        // Return the unique suggested username
        return await APIResponse.success(
          response,
          apiId,
          { suggestedUsername: newUsername },
          HttpStatus.OK,
          API_RESPONSES.USERNAME_SUGGEST_SUCCESSFULLY
        );
      }

      // If findData is not present, return a message indicating that the user was not found
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.USER_NOT_FOUND,
        API_RESPONSES.NOT_FOUND,
        HttpStatus.NOT_FOUND
      );

    } catch (error) {
      // Handle errors gracefully
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

  /**
   * Publish user events to Kafka
   * @param eventType Type of event (created, updated, deleted)
   * @param userId User ID for whom the event is published
   * @param apiId API ID for logging
   */
  public async publishUserEvent(
    eventType: 'created' | 'updated' | 'deleted',
    userId: string,
    apiId: string
  ): Promise<void> {
    try {
      // For delete events, we may want to include just basic information since the user might already be removed
      let userData: any;

      if (eventType === 'deleted') {
        userData = {
          userId: userId,
          deletedAt: new Date().toISOString()
        };
      } else {
        // For create and update, fetch complete data from DB
        try {
          // Get basic user information
          const user = await this.usersRepository.findOne({
            where: { userId: userId },
            select: [
              "userId",
              "username",
              "firstName",
              "name",
              "middleName",
              "lastName",
              "gender",
              "dob",
              "mobile",
              "email",
              "createdAt",
              "updatedAt",
              "status"
            ]
          });

          if (!user) {
            LoggerUtil.error(`Failed to fetch user data for Kafka event`, `User with ID ${userId} not found`);
            userData = { userId };
          } else {
            // Get tenant and role information
            const tenantRoleData = await this.userTenantRoleData(userId);

            // Get custom fields if any
            const customFields = await this.fieldsService.getCustomFieldDetails(userId, 'Users');


            // Get cohort information for the user
            let cohorts = [];
            try {
              // Enhanced query to fetch batch, parent cohort, and academic year details
              const cohortQuery = `
                WITH BatchData AS (
                  SELECT 
                    cm."cohortId" as "batchId",
                    cm."createdAt" as "joinedAt",
                    cm."status" as "cohortMemberStatus",
                    batch."name" as "batchName",
                    batch."type" as "batchType",
                    batch."status" as "batchStatus",
                    batch."tenantId",
                    batch."parentId" as "cohortId"
                  FROM public."CohortMembers" cm
                  JOIN public."Cohort" batch ON cm."cohortId" = batch."cohortId"
                  WHERE cm."userId" = $1 AND batch."type" = 'BATCH'
                )
                SELECT 
                  bd.*,
                  cohort."name" as "cohortName",
                  cohort."type" as "cohortType",
                  cay."academicYearId",
                  ay."session" as "academicYearSession"
                FROM BatchData bd
                LEFT JOIN public."Cohort" cohort ON bd."cohortId":: UUID = cohort."cohortId" AND cohort."type" = 'COHORT'
                LEFT JOIN public."CohortAcademicYear" cay ON bd."cohortId":: UUID = cay."cohortId"
                LEFT JOIN public."AcademicYears" ay ON cay."academicYearId" = ay."id"
              `;

              const cohortResults = await this.usersRepository.query(cohortQuery, [userId]);
              if (cohortResults && cohortResults.length > 0) {
                cohorts = cohortResults.map(result => ({
                  // Batch details
                  batchId: result.batchId,
                  batchName: result.batchName,
                  batchStatus: result.batchStatus,
                  joinedAt: result.joinedAt,
                  cohortMemberStatus: result.cohortMemberStatus,
                  tenantId: result.tenantId,

                  // Parent Cohort details
                  cohortId: result.cohortId,
                  cohortName: result.cohortName,
                  cohortType: result.cohortType,

                  // Academic Year details
                  academicYearId: result.academicYearId,
                  academicYearSession: result.academicYearSession
                }));
              }
            } catch (cohortError) {
              LoggerUtil.error(
                `Failed to fetch cohort data for Kafka event`,
                `Error: ${cohortError.message}`,
                apiId
              );
              // Don't fail the entire operation if cohort fetching fails
              cohorts = [];
            }

            // Build the complete data object
            userData = {
              ...user,
              tenantData: tenantRoleData,
              customFields: customFields || [],
              cohorts: cohorts,
              eventTimestamp: new Date().toISOString()
            };
          }
        } catch (error) {
          LoggerUtil.error(
            `Failed to fetch user data for Kafka event`,
            `Error: ${error.message}`
          );
          // Return at least the userId if we can't fetch complete data
          userData = { userId };
        }
      }
      await this.kafkaService.publishUserEvent(eventType, userData, userId);
      LoggerUtil.log(`User ${eventType} event published to Kafka for user ${userId}`, apiId);
    } catch (error) {
      LoggerUtil.error(
        `Failed to publish user ${eventType} event to Kafka`,
        `Error: ${error.message}`,
        apiId
      );
      // Don't throw the error to avoid affecting the main operation
    }
  }

  /**
   * Get users by hierarchical location filters with comprehensive validation and error handling
   */
  async getUsersByHierarchicalLocation(
    tenantId: string,
    request: Request,
    response: Response,
    hierarchicalFiltersDto: HierarchicalLocationFiltersDto
  ): Promise<any> {
    const apiId = APIID.USER_LIST;
    
    try {
      const { limit, offset, sort: [sortField, sortDirection], role, filters, customfields } = hierarchicalFiltersDto;
      
      // Step 1: Get user IDs from all filters
      const userIds = await this.getAllFilteredUserIds(filters, role, tenantId);
      
      // Step 2: Check if any users found
      if (userIds.length === 0) {
        const noUsersMessage = this.getNoUsersFoundMessage(filters, role);
        return APIResponse.success(response, apiId, {
          users: [],
          totalCount: 0,
          currentPageCount: 0,
          limit,
          offset,
          sort: { field: sortField, direction: sortDirection.toLowerCase() }
        }, HttpStatus.OK, noUsersMessage);
      }
      
      // Step 3: Get user data with pagination (normalize sort direction)
      const normalizedSortDirection = sortDirection.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const userData = await this.getPaginatedUsers(userIds, tenantId, limit, offset, sortField, normalizedSortDirection, customfields);
      
      // Step 4: Prepare response with detailed logging
      const responseData = {
        users: userData.users,
        totalCount: userData.totalCount,
        currentPageCount: userData.users.length,
        limit,
        offset,
        sort: { field: sortField, direction: sortDirection.toLowerCase() }
      };

      LoggerUtil.log(`Successfully retrieved ${userData.users.length}/${userData.totalCount} users with filters applied`, apiId);
      return APIResponse.success(response, apiId, responseData, HttpStatus.OK, "Users retrieved successfully");
      
    } catch (error) {
      LoggerUtil.error(`Critical error in getUsersByHierarchicalLocation: ${error.message}`, error.stack, apiId);
      return APIResponse.error(
        response, 
        apiId, 
        "Failed to retrieve users", 
        `An error occurred while processing the hierarchical filters: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get all filtered user IDs from location and role filters with comprehensive error handling
   */
  private async getAllFilteredUserIds(filters: any, roles: string[], tenantId: string): Promise<string[]> {
    const apiId = APIID.USER_LIST;
    
    try {
      // Get user IDs from location filters
      let locationUserIds: string[] = [];
      const filterResult = this.findDeepestFilter(filters);
      
      if (filterResult.level) {
        LoggerUtil.log(`Applying location filter: ${filterResult.level} with ${filterResult.ids.length} values`, apiId);
        locationUserIds = await this.getUserIdsByFilter(filterResult.level, filterResult.ids, tenantId);
        LoggerUtil.log(`Location filter returned ${locationUserIds.length} user IDs`, apiId);
      }
      
      // Get user IDs from role filters
      let roleUserIds: string[] = [];
      if (roles && roles.length > 0) {
        LoggerUtil.log(`Applying role filter with ${roles.length} roles: ${roles.join(', ')}`, apiId);
        roleUserIds = await this.getUserIdsByRoles(roles, tenantId);
        LoggerUtil.log(`Role filter returned ${roleUserIds.length} user IDs`, apiId);
      }
      
      // Validate that at least one filter is provided
      if (locationUserIds.length === 0 && roleUserIds.length === 0) {
        throw new Error('No valid filters provided. Please provide at least one location or role filter');
      }
      
      // Combine results: if both exist, return intersection; otherwise return whichever exists
      let finalUserIds: string[];
      if (locationUserIds.length > 0 && roleUserIds.length > 0) {
        finalUserIds = locationUserIds.filter(id => roleUserIds.includes(id));
        LoggerUtil.log(`Combined filters returned ${finalUserIds.length} user IDs (intersection)`, apiId);
      } else {
        finalUserIds = locationUserIds.length > 0 ? locationUserIds : roleUserIds;
        LoggerUtil.log(`Single filter returned ${finalUserIds.length} user IDs`, apiId);
      }
      
      return finalUserIds;
    } catch (error) {
      LoggerUtil.error(`Error in getAllFilteredUserIds: ${error.message}`, error.stack, apiId);
      throw error;
    }
  }


  /**
   * Generate contextual message when no users are found
   */
  private getNoUsersFoundMessage(filters: any, roles: string[]): string {
    const appliedFilters: string[] = [];
    
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (Array.isArray(value) && value.length > 0) {
          appliedFilters.push(`${key}: ${value.length} value(s)`);
        }
      });
    }
    
    if (roles && roles.length > 0) {
      appliedFilters.push(`roles: ${roles.join(', ')}`);
    }
    
    return appliedFilters.length > 0 
      ? `No users found matching the applied filters: ${appliedFilters.join(', ')}`
      : 'No users found matching the given criteria';
  }

  /**
   * Constants for hierarchical filter levels
   */
  private readonly HIERARCHICAL_FILTER_LEVELS = [
    'batch',    // Most specific - educational cohort membership
    'center',   // Learning center level
    'village',  // Village administrative level
    'block',    // Block administrative level  
    'district', // District administrative level
    'state'     // State administrative level (least specific)
  ] as const;

  /**
   * Find the most specific (deepest) filter provided in the hierarchy
   */
  private findDeepestFilter(filters: Record<string, any>): { level: string | null, ids: string[] } {
    if (!filters || typeof filters !== 'object') {
      return { level: null, ids: [] };
    }
    
    // Check filters in order from most specific to least specific
    for (const level of this.HIERARCHICAL_FILTER_LEVELS) {
      const filterIds = filters[level];
      if (filterIds && Array.isArray(filterIds) && filterIds.length > 0) {
        // Filter out empty strings and null values
        const validIds = filterIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
        if (validIds.length > 0) {
          return { level, ids: validIds };
        }
      }
    }
    
    return { level: null, ids: [] };
  }

  /**
   * SQL Query constants for better maintainability
   */
  private readonly SQL_QUERIES = {
    BATCH_USERS: `
      SELECT DISTINCT cm."userId" 
      FROM "CohortMembers" cm
      JOIN "Users" u ON cm."userId" = u."userId"
      WHERE cm."cohortId" = ANY($1) 
        AND cm."status" = 'active'
        AND u."status" != 'archived'
    `,
    
    FIELD_BY_NAME: `
      SELECT "fieldId" 
      FROM "Fields" 
      WHERE "name" = $1 
      LIMIT 1
    `,
    
    USERS_BY_FIELD_VALUES: `
      SELECT DISTINCT fv."itemId" 
      FROM "FieldValues" fv
      JOIN "Users" u ON fv."itemId" = u."userId"
      WHERE fv."fieldId" = $1 
        AND fv."value" && $2 
        AND fv."tenantId" = $3
        AND u."status" != 'archived'
    `,
    
    USERS_BY_ROLES: `
      SELECT DISTINCT urm."userId" 
      FROM "UserRolesMapping" urm
      JOIN "Roles" r ON urm."roleId" = r."roleId"
      JOIN "Users" u ON urm."userId" = u."userId"
      WHERE r."name" = ANY($1) 
        AND urm."tenantId" = $2
        AND u."status" != 'archived'
    `
  } as const;

  /**
   * Get user IDs by filter level with enhanced error handling and logging
   */
  private async getUserIdsByFilter(filterLevel: string, filterIds: string[], tenantId: string): Promise<string[]> {
    const apiId = APIID.USER_LIST;
    
    try {
      // Validate inputs
      if (!filterLevel || !filterIds || filterIds.length === 0 || !tenantId) {
        throw new Error('Invalid parameters: filterLevel, filterIds, and tenantId are required');
      }

      // Handle batch filter differently (uses cohort membership)
      if (filterLevel === 'batch') {
        LoggerUtil.log(`Executing batch filter query for ${filterIds.length} batch IDs`, apiId);
        const result = await this.usersRepository.query(this.SQL_QUERIES.BATCH_USERS, [filterIds]);
        const userIds = result.map(row => row.userId);
        LoggerUtil.log(`Batch filter returned ${userIds.length} active users`, apiId);
        return userIds;
      }
      
      // Handle location fields (uses custom fields)
      return this.getUserIdsByLocationField(filterLevel, filterIds, tenantId);
    } catch (error) {
      LoggerUtil.error(
        `Error in getUserIdsByFilter for level '${filterLevel}': ${error.message}`,
        error.stack,
        apiId
      );
      throw new Error(`Failed to filter users by ${filterLevel}: ${error.message}`);
    }
  }


  /**
   * Get user IDs by location field with comprehensive validation and error handling
   */
  private async getUserIdsByLocationField(fieldName: string, fieldValues: string[], tenantId: string): Promise<string[]> {
    const apiId = APIID.USER_LIST;
    
    try {
      // Validate inputs
      if (!fieldName || typeof fieldName !== 'string') {
        throw new Error('Field name is required and must be a string');
      }
      
      if (!fieldValues || !Array.isArray(fieldValues) || fieldValues.length === 0) {
        throw new Error('Field values are required and must be a non-empty array');
      }
      
      if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('Tenant ID is required and must be a string');
      }

      // Step 1: Get field ID by field name with better error handling
      LoggerUtil.log(`Looking up field ID for field '${fieldName}'`, apiId);
      const fieldResult = await this.usersRepository.query(this.SQL_QUERIES.FIELD_BY_NAME, [fieldName]);
      
      if (fieldResult.length === 0) {
        throw new Error(`Configuration error: Field '${fieldName}' not found or not active. Please check field configuration.`);
      }
      
      const fieldId = fieldResult[0].fieldId;
      LoggerUtil.log(`Found field ID '${fieldId}' for field '${fieldName}'`, apiId);
      
      // Step 2: Get user IDs that have matching field values (excluding archived users)
      LoggerUtil.log(`Searching for users with ${fieldName} values: ${fieldValues.join(', ')}`, apiId);
      const result = await this.usersRepository.query(
        this.SQL_QUERIES.USERS_BY_FIELD_VALUES, 
        [fieldId, fieldValues, tenantId]
      );
      
      const userIds = result.map(row => row.itemId);
      LoggerUtil.log(`Location field '${fieldName}' filter returned ${userIds.length} active users`, apiId);
      
      return userIds;
    } catch (error) {
      LoggerUtil.error(
        `Error in getUserIdsByLocationField for field '${fieldName}': ${error.message}`,
        error.stack,
        apiId
      );
      throw error; // Re-throw to be handled by caller with context
    }
  }

  /**
   * Get user IDs by roles with enhanced validation and error handling
   */
  private async getUserIdsByRoles(roleNames: string[], tenantId: string): Promise<string[]> {
    const apiId = APIID.USER_LIST;
    
    try {
      // Validate inputs
      if (!roleNames || !Array.isArray(roleNames) || roleNames.length === 0) {
        throw new Error('Role names are required and must be a non-empty array');
      }
      
      if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('Tenant ID is required and must be a string');
      }

      // Filter out invalid role names
      const validRoleNames = roleNames.filter(role => role && typeof role === 'string' && role.trim().length > 0);
      
      if (validRoleNames.length === 0) {
        throw new Error('No valid role names provided');
      }

      if (validRoleNames.length !== roleNames.length) {
        LoggerUtil.warn(`Filtered out ${roleNames.length - validRoleNames.length} invalid role names`, apiId);
      }

      LoggerUtil.log(`Searching for users with roles: ${validRoleNames.join(', ')}`, apiId);
      
      // Execute query to get user IDs by role names and tenant (excluding archived users)
      const result = await this.usersRepository.query(this.SQL_QUERIES.USERS_BY_ROLES, [validRoleNames, tenantId]);
      
      const userIds = result.map(row => row.userId);
      LoggerUtil.log(`Role filter returned ${userIds.length} active users for roles: ${validRoleNames.join(', ')}`, apiId);
      
      return userIds;
    } catch (error) {
      LoggerUtil.error(
        `Error in getUserIdsByRoles: ${error.message}`,
        error.stack,
        apiId
      );
      throw new Error(`Failed to filter users by roles: ${error.message}`);
    }
  }

   /**
    * Get paginated users with all related data in optimized manner
    */
   private async getPaginatedUsers(
     userIds: string[], 
     tenantId: string, 
     limit: number, 
     offset: number, 
     sortField: string, 
     sortDirection: string, 
     customFieldNames?: string[]
   ): Promise<{ totalCount: number; users: any[] }> {
     const apiId = APIID.USER_LIST;
     
     try {
       // Validate inputs
       if (!userIds || userIds.length === 0) {
         return { totalCount: 0, users: [] };
       }

       if (limit <= 0 || limit > 100) {
         throw new Error('Limit must be between 1 and 100');
       }

       if (offset < 0) {
         throw new Error('Offset must be 0 or greater');
       }

       LoggerUtil.log(`Processing ${userIds.length} user IDs with pagination: limit=${limit}, offset=${offset}`, apiId);
       
       // Execute all database queries in parallel for better performance
       const [totalCount, users, customFieldsData, batchCenterData] = await Promise.allSettled([
         // Step 1: Get total count of users
         this.getUserCount(userIds, tenantId),
         
         // Step 2: Get basic user details with pagination and sorting
         this.getUserDetails(userIds, tenantId, limit, offset, sortField, sortDirection),
         
         // Step 3: Get custom fields data (if requested)
         customFieldNames && customFieldNames.length > 0 
           ? this.getCustomFieldsData(userIds, customFieldNames, tenantId)
           : Promise.resolve({}),
         
         // Step 4: Get batch and center names from cohort memberships
         this.getBatchAndCenterNames(userIds)
       ]);

       // Handle any failed promises
       if (totalCount.status === 'rejected') {
         throw new Error(`Failed to get user count: ${totalCount.reason?.message || 'Unknown error'}`);
       }
       
       if (users.status === 'rejected') {
         throw new Error(`Failed to get user details: ${users.reason?.message || 'Unknown error'}`);
       }

       // Custom fields and batch center data are optional - log warnings if they fail
       let finalCustomFieldsData = {};
       if (customFieldsData.status === 'rejected') {
         LoggerUtil.warn(`Failed to fetch custom fields data: ${customFieldsData.reason?.message}`, apiId);
       } else {
         finalCustomFieldsData = customFieldsData.value;
       }

       let finalBatchCenterData = {};
       if (batchCenterData.status === 'rejected') {
         LoggerUtil.warn(`Failed to fetch batch and center data: ${batchCenterData.reason?.message}`, apiId);
       } else {
         finalBatchCenterData = batchCenterData.value;
       }
       
       // Step 5: Combine all data together
       const finalUsers = this.aggregateUserRoles(
         users.value, 
         finalCustomFieldsData, 
         customFieldNames || [], 
         finalBatchCenterData
       );
       
       LoggerUtil.log(`Successfully processed ${finalUsers.length} users with ${Object.keys(finalCustomFieldsData).length} custom field entries`, apiId);
       
       return { totalCount: totalCount.value, users: finalUsers };
     } catch (error) {
       LoggerUtil.error(`Error in getPaginatedUsers: ${error.message}`, error.stack, apiId);
       throw error;
     }
   }

   /**
    * Get batch and center names for users using cohort membership
    */
   /**
    * Get batch and center names for users using cohort membership with improved error handling
    */
   private async getBatchAndCenterNames(userIds: string[]): Promise<Record<string, { batchName: string | null; centerName: string | null }>> {
     const apiId = APIID.USER_LIST;
     
     if (!userIds || userIds.length === 0) {
       return {};
     }

     const query = `
       SELECT 
         cm."userId",
         batch."name" AS "batchName",
         batch."status" AS "batchStatus",
         center."name" AS "centerName",
         center."status" AS "centerStatus"
       FROM 
         public."CohortMembers" cm
         LEFT JOIN public."Cohort" batch ON cm."cohortId" = batch."cohortId"
         LEFT JOIN public."Cohort" center ON batch."parentId"::uuid = center."cohortId"
       WHERE 
         cm."userId" = ANY($1)
         AND cm."status" = 'active'
         AND (batch."status" IS NULL OR batch."status" != 'archived')
         AND (center."status" IS NULL OR center."status" != 'archived')
       ORDER BY cm."createdAt" DESC
     `;

     try {
       LoggerUtil.log(`Fetching batch and center names for ${userIds.length} users`, apiId);
       const result = await this.usersRepository.query(query, [userIds]);
       
       // Group by userId - take the most recent active membership if multiple exist
       const batchCenterMap: Record<string, { batchName: string | null; centerName: string | null }> = {};
       result.forEach(row => {
         const { userId, batchName, centerName, batchStatus, centerStatus } = row;
         if (!batchCenterMap[userId]) {
           batchCenterMap[userId] = {
             batchName: (batchStatus === 'archived' || !batchName) ? null : batchName,
             centerName: (centerStatus === 'archived' || !centerName) ? null : centerName
           };
         }
       });

       LoggerUtil.log(`Batch and center data fetched for ${Object.keys(batchCenterMap).length} users`, apiId);
       return batchCenterMap;
     } catch (error) {
       LoggerUtil.error(`Error fetching batch and center names: ${error.message}`, error.stack, apiId);
       // Return empty object instead of throwing to avoid breaking the main operation
       return {};
     }
   }

  /**
   * Get count of users with proper error handling and validation
   */
  private async getUserCount(userIds: string[], tenantId: string): Promise<number> {
    const apiId = APIID.USER_LIST;
    
    try {
      if (!userIds || userIds.length === 0) {
        return 0;
      }
      
      if (!tenantId) {
        throw new Error('Tenant ID is required for user count');
      }

      const query = `
        SELECT COUNT(DISTINCT u."userId") as total
        FROM "Users" u
        LEFT JOIN "UserTenantMapping" utm ON u."userId" = utm."userId"
        WHERE u."userId" = ANY($1) 
          AND utm."tenantId" = $2
          AND u."status" != 'archived'
      `;
      
      const result = await this.usersRepository.query(query, [userIds, tenantId]);
      const count = parseInt(result[0]?.total || '0');
      
      LoggerUtil.log(`User count query returned ${count} active users`, apiId);
      return count;
    } catch (error) {
      LoggerUtil.error(`Error in getUserCount: ${error.message}`, error.stack, apiId);
      throw new Error(`Failed to get user count: ${error.message}`);
    }
  }

  /**
   * Get user details with enhanced security and error handling
   */
  private async getUserDetails(
    userIds: string[], 
    tenantId: string, 
    limit: number, 
    offset: number, 
    sortField: string, 
    sortDirection: string
  ): Promise<any[]> {
    const apiId = APIID.USER_LIST;
    
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }
      
      // Validate sort parameters for SQL injection prevention
      const allowedSortFields = ['name', 'firstName', 'lastName', 'username', 'email', 'createdAt'];
      const allowedSortDirections = ['ASC', 'DESC'];
      
      if (!allowedSortFields.includes(sortField)) {
        throw new Error(`Invalid sort field: ${sortField}`);
      }
      
      if (!allowedSortDirections.includes(sortDirection)) {
        throw new Error(`Invalid sort direction: ${sortDirection}`);
      }

      const query = `
        SELECT DISTINCT
          u."userId", u."username", u."firstName", u."name", u."middleName", 
          u."lastName", u."email", u."mobile", u."gender", u."dob", 
          u."status", u."createdAt", utm."tenantId", r."name" as "roleName"
        FROM "Users" u
        LEFT JOIN "UserTenantMapping" utm ON u."userId" = utm."userId"
        LEFT JOIN "UserRolesMapping" urm ON u."userId" = urm."userId" AND utm."tenantId" = urm."tenantId"
        LEFT JOIN "Roles" r ON urm."roleId" = r."roleId"
        WHERE u."userId" = ANY($1) 
          AND utm."tenantId" = $2
          AND u."status" != 'archived'
        ORDER BY u."${sortField}" ${sortDirection}
        LIMIT $3 OFFSET $4
      `;
      
      LoggerUtil.log(`Executing user details query with sort: ${sortField} ${sortDirection}, limit: ${limit}, offset: ${offset}`, apiId);
      const result = await this.usersRepository.query(query, [userIds, tenantId, limit, offset]);
      
      LoggerUtil.log(`User details query returned ${result.length} rows`, apiId);
      return result;
    } catch (error) {
      LoggerUtil.error(`Error in getUserDetails: ${error.message}`, error.stack, apiId);
      throw new Error(`Failed to get user details: ${error.message}`);
    }
  }

   /**
    * Aggregate user roles and custom fields with improved data processing
    */
   private aggregateUserRoles(
     userDetails: any[], 
     customFieldsData: Record<string, any> = {}, 
     requestedCustomFields: string[] = [], 
     batchCenterData: Record<string, { batchName: string | null; centerName: string | null }> = {}
   ): any[] {
     const apiId = APIID.USER_LIST;
     
     try {
       if (!userDetails || userDetails.length === 0) {
         return [];
       }

       const usersMap = new Map<string, any>();
       
       userDetails.forEach(user => {
         const { userId, roleName, ...userData } = user;
         
         if (!userId) {
           LoggerUtil.warn('Skipping user record without userId', apiId);
           return;
         }
         
         if (usersMap.has(userId)) {
           // User already exists, just add role if new
           const existingUser = usersMap.get(userId);
           if (roleName && typeof roleName === 'string' && !existingUser.roles.includes(roleName)) {
             existingUser.roles.push(roleName);
           }
         } else {
           // Create new user object
           const userObject: any = {
             ...userData,
             userId,
             roles: roleName && typeof roleName === 'string' ? [roleName] : []
           };
           
           // Only add customfield property if custom fields were requested
           if (requestedCustomFields.length > 0) {
             const userCustomFields = customFieldsData[userId] || {};
             const userBatchCenter = batchCenterData[userId] || { batchName: null, centerName: null };
             const processedCustomFields: Record<string, any> = {};
             
             // Initialize ALL requested fields, set to null if not found
             requestedCustomFields.forEach(fieldName => {
               let fieldValue: any;
               
               // Handle batch and center specially using the cohort membership data
               if (fieldName === 'batch') {
                 fieldValue = userBatchCenter.batchName;
               } else if (fieldName === 'center') {
                 fieldValue = userBatchCenter.centerName;
               } else {
                 // Handle regular custom fields from the FieldValues table
                 const rawValue = userCustomFields[fieldName];
                 
                 if (rawValue !== undefined && rawValue !== null) {
                   // If it's an array, take the first value; otherwise use as is
                   fieldValue = Array.isArray(rawValue) && rawValue.length > 0 
                     ? rawValue[0] 
                     : (Array.isArray(rawValue) ? null : rawValue);
                 } else {
                   // Field not found or no data, set to null
                   fieldValue = null;
                 }
               }
               
               processedCustomFields[fieldName] = fieldValue;
             });
             
             userObject.customfield = processedCustomFields;
           }
          
          usersMap.set(userId, userObject);
         }
       });
       
       const result = Array.from(usersMap.values());
       LoggerUtil.log(`Aggregated ${result.length} unique users from ${userDetails.length} user detail records`, apiId);
       
       return result;
     } catch (error) {
       LoggerUtil.error(`Error in aggregateUserRoles: ${error.message}`, error.stack, apiId);
       throw new Error(`Failed to aggregate user data: ${error.message}`);
     }
   }

  /**
   * Get custom fields data with comprehensive error handling and caching potential
   */
  private async getCustomFieldsData(
    userIds: string[], 
    customFieldNames: string[], 
    tenantId: string
  ): Promise<Record<string, Record<string, any>>> {
    const apiId = APIID.USER_LIST;
    
    try {
      if (!customFieldNames || customFieldNames.length === 0) {
        return {};
      }

      if (!userIds || userIds.length === 0) {
        return {};
      }

      // Filter out batch and center as they're handled separately
      const regularCustomFields = customFieldNames.filter(name => !['batch', 'center'].includes(name));
      
      if (regularCustomFields.length === 0) {
        LoggerUtil.log('Only batch and center fields requested - skipping custom fields query', apiId);
        return {};
      }

      LoggerUtil.log(`Fetching custom field data for fields: ${regularCustomFields.join(', ')}`, apiId);

      // Get field IDs for requested custom fields (search only by name)
      const fieldsQuery = `
        SELECT "fieldId", "name" 
        FROM "Fields" 
        WHERE "name" = ANY($1)
      `;
      
      const fieldsResult = await this.usersRepository.query(fieldsQuery, [regularCustomFields]);
      
      if (fieldsResult.length === 0) {
        LoggerUtil.warn(`No fields found for requested names: ${regularCustomFields.join(', ')}`, apiId);
        return {};
      }

      const foundFields = fieldsResult.map(f => f.name);
      const missingFields = regularCustomFields.filter(name => !foundFields.includes(name));
      
      if (missingFields.length > 0) {
        LoggerUtil.warn(`Some requested fields not found: ${missingFields.join(', ')}`, apiId);
      }

      const fieldIds = fieldsResult.map(field => field.fieldId);
      const fieldNameMap = fieldsResult.reduce((acc, field) => {
        acc[field.fieldId] = field.name;
        return acc;
      }, {} as Record<string, string>);

      // Get custom field values for the users (search with tenantId)
      const customFieldsQuery = `
        SELECT "itemId", "fieldId", "value"
        FROM "FieldValues" 
        WHERE "fieldId" = ANY($1) 
          AND "itemId" = ANY($2) 
          AND "tenantId" = $3
          AND "value" IS NOT NULL
      `;

      const customFieldsResult = await this.usersRepository.query(customFieldsQuery, [fieldIds, userIds, tenantId]);
      LoggerUtil.log(`Custom fields query returned ${customFieldsResult.length} value records`, apiId);

      // Structure the data by userId and fieldName
      const customFieldsData: Record<string, Record<string, any>> = {};
      
      customFieldsResult.forEach(row => {
        const { itemId: userId, fieldId, value } = row;
        const fieldName = fieldNameMap[fieldId];
        
        if (!fieldName) {
          LoggerUtil.warn(`Unknown fieldId: ${fieldId}`, apiId);
          return;
        }
        
        if (!customFieldsData[userId]) {
          customFieldsData[userId] = {};
        }
        
        // Store the value as-is (text[] from database)
        customFieldsData[userId][fieldName] = value || [];
      });

      LoggerUtil.log(`Structured custom field data for ${Object.keys(customFieldsData).length} users`, apiId);

      // Resolve location field IDs to names for state, district, block, village
      const resolvedCustomFieldsData = await this.resolveLocationFieldNames(customFieldsData);

      return resolvedCustomFieldsData;
    } catch (error) {
      LoggerUtil.error(`Error in getCustomFieldsData: ${error.message}`, error.stack, apiId);
      // Return empty object rather than throwing to avoid breaking the main operation
      return {};
    }
  }

   private async resolveLocationFieldNames(customFieldsData: any) {
     // Define location fields that need ID-to-name resolution
     // Note: batch and center are now handled separately via getBatchAndCenterNames function
     const locationFields = ['state', 'district', 'block', 'village'];
     const locationTableMap = {
       'state': { table: 'state', idColumn: 'state_id', nameColumn: 'state_name' },
       'district': { table: 'district', idColumn: 'district_id', nameColumn: 'district_name' },
       'block': { table: 'block', idColumn: 'block_id', nameColumn: 'block_name' },
       'village': { table: 'village', idColumn: 'village_id', nameColumn: 'village_name' }
     };

    // Collect all unique IDs for each location field type
    const locationIds = {};
    Object.keys(customFieldsData).forEach(userId => {
      Object.keys(customFieldsData[userId]).forEach(fieldName => {
        if (locationFields.includes(fieldName)) {
          if (!locationIds[fieldName]) {
            locationIds[fieldName] = new Set();
          }
          
          const fieldValue = customFieldsData[userId][fieldName];
          if (Array.isArray(fieldValue)) {
            fieldValue.forEach(id => {
              if (id) locationIds[fieldName].add(id);
            });
          }
        }
      });
    });

    // Fetch names for each location field type
    const locationNameMaps = {};
    
    for (const fieldName of Object.keys(locationIds)) {
      if (locationIds[fieldName].size > 0) {
        const tableInfo = locationTableMap[fieldName];
        const idsArray = Array.from(locationIds[fieldName]);
        
         // Build query for regular location tables
         const nameQuery = `
           SELECT "${tableInfo.idColumn}", "${tableInfo.nameColumn}" 
           FROM "${tableInfo.table}" 
           WHERE "${tableInfo.idColumn}" = ANY($1)
         `;
         const queryParams = [idsArray];
        
         try {
           const nameResult = await this.usersRepository.query(nameQuery, queryParams);
           
           // Standard ID to name mapping for all location fields
           locationNameMaps[fieldName] = nameResult.reduce((acc, row) => {
             const id = row[tableInfo.idColumn];
             const name = row[tableInfo.nameColumn];
             if (id && name) {
               acc[id] = name;
             }
             return acc;
           }, {});
         } catch (error) {
           console.warn(`Could not resolve names for ${fieldName}:`, error.message);
           locationNameMaps[fieldName] = {};
         }
      }
    }

     // Replace IDs with names in the custom fields data
     // Note: batch and center are now handled separately, so they're excluded from this logic
     const resolvedData = {};
     Object.keys(customFieldsData).forEach(userId => {
       resolvedData[userId] = {};
       Object.keys(customFieldsData[userId]).forEach(fieldName => {
         const fieldValue = customFieldsData[userId][fieldName];
         
         if (locationFields.includes(fieldName) && locationNameMaps[fieldName]) {
           // Replace ID with name for location fields (state, district, block, village)
           if (Array.isArray(fieldValue) && fieldValue.length > 0) {
             const id = fieldValue[0]; // Take first ID
             const resolvedName = locationNameMaps[fieldName][id];
             resolvedData[userId][fieldName] = resolvedName || id; // Use resolved name or fallback to original ID
           } else {
             resolvedData[userId][fieldName] = fieldValue;
           }
         } else {
           // Keep original value for non-location fields (including batch and center which are handled elsewhere)
           resolvedData[userId][fieldName] = fieldValue;
         }
       });
     });

    return resolvedData;
  }
}
