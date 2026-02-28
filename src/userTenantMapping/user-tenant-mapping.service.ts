import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import {
  UserTenantMappingDto,
  ResponseAssignTenantDto,
} from "src/userTenantMapping/dto/user-tenant-mapping.dto";
import { ErrorResponseTypeOrm } from "src/error-response-typeorm";
import { SuccessResponse } from "src/success-response";
import { User } from "src/user/entities/user-entity";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { isUUID } from "class-validator";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { UserService } from "src/user/user.service";
import { FieldsService } from "src/fields/fields.service";
import { KafkaService } from "src/kafka/kafka.service";
import { API_RESPONSES } from "src/common/utils/response.messages";

@Injectable()
export class UserTenantMappingService {
  constructor(
    @InjectRepository(UserTenantMapping)
    private userTenantMappingRepository: Repository<UserTenantMapping>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRoleMapping)
    private userRoleMappingRepository: Repository<UserRoleMapping>,
    private userService: UserService,
    private fieldsService: FieldsService,
    private kafkaService: KafkaService
  ) { }

  public async validateUserTenantMapping(
    userId: string,
    tenantId: string,
    roleId: string,
    customField: any[],
    apiId: string,
    response: Response,
    errors: any[]
  ) {
    const [userExist, tenantExist, existingRoleMapping, roleExist] = await Promise.all([
      this.userRepository.findOne({ where: { userId } }),
      this.tenantsRepository.findOne({ where: { tenantId } }),
      this.userRoleMappingRepository.findOne({ where: { userId, tenantId, roleId } }),
      this.roleRepository.findOne({ where: { roleId } }),
    ]);

    if (!userExist) {
      errors.push({ errorMessage: API_RESPONSES.USER_DOES_NOT_EXIST(userId) });
      return false;
    }

    if (!tenantExist) {
      errors.push({ errorMessage: API_RESPONSES.TENANT_DOES_NOT_EXIST(tenantId) });
      return false;
    }

    // Check if user already has the same role in the same tenant
    if (existingRoleMapping) {
      errors.push({ errorMessage: API_RESPONSES.USER_ALREADY_HAS_ROLE_IN_TENANT(roleId, tenantId) });
      return false;
    }

    if (!roleExist) {
      errors.push({ errorMessage: API_RESPONSES.ROLE_DOES_NOT_EXIST(roleId) });
      return false;
    }

    // Validate custom fields if provided
    if (customField && customField.length > 0) {
      // Transform DTO to match the structure expected by UserService.validateCustomField
      const transformedDto = {
        customFields: customField, // Note: UserService expects 'customFields' not 'customField'
        tenantCohortRoleMapping: [{ tenantId }, { roleId }] // Provide tenantId in expected structure
      };

      // Use existing validateCustomField from UserService
      const customFieldError = await this.userService.validateCustomField(
        transformedDto,
        response,
        apiId
      );

      if (customFieldError) {
        errors.push({ errorMessage: customFieldError });
        return false;
      }
    }
    return true;
  }

  public async userTenantMapping(
    request: any,
    assignTenantMappingDto: UserTenantMappingDto,
    response: Response
  ) {
    const apiId = APIID.ASSIGN_TENANT_CREATE;
    try {

      const { userId, tenantId, roleId, customField = [], userTenantStatus } = assignTenantMappingDto;
      const errors = [];

      // Step 2: Validate user-tenant-role mapping
      const isValid = await this.validateUserTenantMapping(
        userId,
        tenantId,
        roleId,
        customField,
        apiId,
        response,
        errors
      );

      if (!isValid) {
        return APIResponse.error(
          response,
          apiId,
          "Bad Request",
          `User not added to tenant: ${errors[0].errorMessage}`,
          HttpStatus.BAD_REQUEST
        );
      }

      // Step 3 & 4: Save user-tenant mapping and user-role mapping using reusable function
      const tenantsData = {
        userId: userId,
        tenantRoleMapping: {
          tenantId: tenantId,
          roleId: roleId
        },
        userTenantStatus: userTenantStatus || "active" // Default to "active" if not provided
      };

      await this.userService.assignUserToTenantAndRoll(
        tenantsData,
        request["user"].userId,
        true
      );

      LoggerUtil.log(
        API_RESPONSES.LOG_USER_ASSIGNED_ROLE_IN_TENANT(userId, roleId, tenantId),
        apiId,
        userId
      );

      // Step 5: Process custom fields if provided
      const createFailures = [];
      if (customField && customField.length > 0) {
        LoggerUtil.log(
          API_RESPONSES.LOG_PROCESSING_CUSTOM_FIELDS(customField.length, userId, tenantId),
          apiId,
          userId
        );

        // Get role code from the role entity
        const role = await this.roleRepository.findOne({ where: { roleId } });
        const roles = role ? [role.code?.toUpperCase()] : [];

        // Find custom fields for USER_TENANT_MAPPING context
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

          for (const fieldValues of customField) {
            const fieldData = {
              fieldId: fieldValues["fieldId"],
              value: fieldValues["value"],
            };

            // Prepare additional data for FieldValues table
            const additionalData = {
              tenantId: tenantId,
              contextType: "USER",
              createdBy: request["user"].userId,
              updatedBy: request["user"].userId,
            };

            await this.fieldsService.updateUserCustomFields(
              userId,
              fieldData,
              customFieldAttributes[fieldData.fieldId],
              additionalData
            );
          }
        }
      }

      // Construct response
      const result = {
        userId: userId,
        tenantId: tenantId,
        roleId: roleId,
        message: API_RESPONSES.USER_ADDED_TO_TENANT_WITH_ROLE,
        createFailures: createFailures.length > 0 ? createFailures : undefined
      };

      const apiResponse = await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.USER_ADDED_TO_TENANT_WITH_ROLE_SUCCESS
      );

      // Publish user-tenant mapping event to Kafka asynchronously - after response is sent to client
      this.publishUserTenantMappingEvent('created', userId, tenantId, apiId)
        .catch(error => LoggerUtil.error(
          API_RESPONSES.ERROR_FAILED_PUBLISH_USER_TENANT_CREATED(userId),
          `Error: ${error.message}`,
          apiId,
          userId
        ));

      return apiResponse;
    } catch (error) {
      console.log('error', error);
      const errorMessage = error?.message || "Something went wrong";
      LoggerUtil.error(
        API_RESPONSES.ERROR_IN_USER_TENANT_MAPPING(assignTenantMappingDto.userId),
        `Error: ${errorMessage}`,
        apiId,
        assignTenantMappingDto.userId
      );
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async getUserTenantMappings(
    userId: string,
    includeArchived: boolean,
    response: Response
  ) {
    const apiId = "API-USER-TENANT-MAPPING-GET";

    try {
      // Validate userId
      if (!isUUID(userId)) {
        return APIResponse.error(
          response,
          apiId,
          "BAD_REQUEST",
          "Invalid userId format. Must be a valid UUID.",
          HttpStatus.BAD_REQUEST
        );
      }

      // Build SQL query with JOIN to get tenant details
      let query = `
        SELECT 
          UTM."Id" as "mappingId",
          UTM."userId",
          UTM."tenantId",
          UTM."status",
          UTM."createdAt",
          UTM."updatedAt",
          UTM."createdBy",
          UTM."updatedBy",
          T."name" as "tenantName",
          T."domain" as "tenantDomain",
          T."status" as "tenantStatus"
        FROM public."UserTenantMapping" UTM
        LEFT JOIN public."Tenants" T ON UTM."tenantId" = T."tenantId"
        WHERE UTM."userId" = $1
      `;

      // Filter archived if not requested
      if (!includeArchived) {
        query += ` AND UTM."status" != 'archived'`;
      }

      query += ` ORDER BY UTM."createdAt" DESC`;

      const mappings = await this.userTenantMappingRepository.query(query, [userId]);

      if (mappings.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          "NOT_FOUND",
          API_RESPONSES.NO_TENANT_MAPPINGS_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        { mappings, totalCount: mappings.length },
        HttpStatus.OK,
        API_RESPONSES.USER_TENANT_MAPPINGS_RETRIEVED
      );

    } catch (error) {
      LoggerUtil.error(
        API_RESPONSES.ERROR_GET_USER_TENANT_MAPPINGS,
        `Error: ${error.message}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        "INTERNAL_SERVER_ERROR",
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async updateAssignTenantStatus(
    request: any,
    userId: string,
    tenantId: string,
    updateStatusDto: any,
    response: Response
  ) {
    const apiId = APIID.ASSIGN_TENANT_UPDATE_STATUS;
    
    try {
      // Check if the mapping exists
      const existingMapping = await this.userTenantMappingRepository.findOne({
        where: { userId, tenantId },
      });

      if (!existingMapping) {
        return APIResponse.error(
          response,
          apiId,
          "NOT_FOUND",
          API_RESPONSES.USER_TENANT_MAPPING_NOT_FOUND(userId, tenantId),
          HttpStatus.NOT_FOUND
        );
      }

      // Update the status
      existingMapping.status = updateStatusDto.status;
      existingMapping.updatedBy = request["user"].userId;
      existingMapping.updatedAt = new Date();
      
      // Update reason if provided
      if (updateStatusDto.reason) {
        existingMapping.reason = updateStatusDto.reason;
      }

      await this.userTenantMappingRepository.save(existingMapping);

      LoggerUtil.log(
        API_RESPONSES.LOG_STATUS_UPDATED_FOR_USER_TENANT(userId, tenantId),
        apiId,
        userId
      );

      // Construct response
      const result = {
        userId: userId,
        tenantId: tenantId,
        status: existingMapping.status,
        reason: existingMapping.reason,
        message: API_RESPONSES.USER_TENANT_MAPPING_STATUS_UPDATED,
      };

      const apiResponse = await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.USER_TENANT_MAPPING_STATUS_UPDATED
      );

      // Publish user-tenant status update event to Kafka asynchronously - after response is sent to client
      this.publishUserTenantMappingEvent('updated_status', userId, tenantId, apiId)
        .catch(error => LoggerUtil.error(
          API_RESPONSES.ERROR_FAILED_PUBLISH_USER_TENANT_UPDATED(userId),
          `Error: ${error.message}`,
          apiId,
          userId
        ));

      return apiResponse;
    } catch (error) {
      console.log('error', error);
      const errorMessage = error?.message || "Something went wrong";
      LoggerUtil.error(
        API_RESPONSES.ERROR_IN_UPDATE_TENANT_STATUS(userId, tenantId),
        `Error: ${errorMessage}`,
        apiId,
        userId
      );
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Publish user-tenant mapping events to Kafka
   * @param eventType Type of event (created, updated, deleted)
   * @param userId User ID
   * @param tenantId Tenant ID
   * @param apiId API ID for logging
   */
  public async publishUserTenantMappingEvent(
    eventType: 'created' | 'updated_status' | 'deleted',
    userId: string,
    tenantId: string,
    apiId: string
  ): Promise<void> {
    try {
      // For delete events, we may want to include just basic information since the mapping might already be removed
      let userTenantData: any;

      if (eventType === 'deleted') {
        userTenantData = {
          userId: userId,
          tenantId: tenantId,
          deletedAt: new Date().toISOString()
        };
      } else if (eventType === 'updated_status') {
        // For USER_TENANT_STATUS_UPDATE, fetch only UserTenantMapping table data
        try {
          const mapping = await this.userTenantMappingRepository.findOne({
            where: { userId, tenantId },
            select: ["Id", "userId", "tenantId", "status", "reason", "createdAt", "updatedAt", "createdBy", "updatedBy"]
          });

          if (!mapping) {
            LoggerUtil.error(
              API_RESPONSES.ERROR_FAILED_FETCH_MAPPING_DATA,
              `Mapping not found for userId: ${userId}, tenantId: ${tenantId}`,
              apiId
            );
            userTenantData = { userId, tenantId };
          } else {
            // Build the user-tenant data object with only UserTenantMapping table fields
            userTenantData = {
              Id: mapping.Id,
              userId: mapping.userId,
              tenantId: mapping.tenantId,
              status: mapping.status,
              reason: mapping.reason,
              createdAt: mapping.createdAt,
              updatedAt: mapping.updatedAt,
              createdBy: mapping.createdBy,
              updatedBy: mapping.updatedBy
            };
          }
        } catch (error) {
          LoggerUtil.error(
            API_RESPONSES.ERROR_FAILED_FETCH_MAPPING_DATA,
            `Error: ${error.message}`,
            apiId
          );
          // Return at least the userId and tenantId if we can't fetch complete data
          userTenantData = { userId, tenantId };
        }
      } else {
        // For create events (USER_TENANT_MAPPING), fetch complete data from DB
        try {
          // Fetch user-tenant mapping data
          const mapping = await this.userTenantMappingRepository.findOne({
            where: { userId, tenantId },
          });

          if (!mapping) {
            LoggerUtil.error(
              API_RESPONSES.ERROR_FAILED_FETCH_MAPPING_DATA,
              `Mapping not found for userId: ${userId}, tenantId: ${tenantId}`,
              apiId
            );
            userTenantData = { userId, tenantId };
          } else {
            // Get user information
            const user = await this.userRepository.findOne({
              where: { userId },
              select: ["userId", "username", "firstName", "lastName","middleName", "email", "mobile"]
            });

            // Get tenant information
            const tenant = await this.tenantsRepository.findOne({
              where: { tenantId },
              select: ["tenantId", "name", "domain"]
            });

            // Get role information for this user in this tenant
            const userRoleMapping = await this.userRoleMappingRepository.findOne({
              where: { userId, tenantId }
            });

            let roleInfo = null;
            if (userRoleMapping) {
              const role = await this.roleRepository.findOne({
                where: { roleId: userRoleMapping.roleId }
              });
              if (role) {
                roleInfo = {
                  roleId: role.roleId,
                  code: role.code,
                  title: role.title
                };
              }
            }

            // Get custom fields for this user-tenant mapping
            let customFields = [];
            try {
              customFields = await this.fieldsService.getCustomFieldDetails(userId, 'Users');
            } catch (error) {
              LoggerUtil.error(
                API_RESPONSES.ERROR_FAILED_FETCH_CUSTOM_FIELDS,
                `Error: ${error.message}`,
                apiId
              );
              // Don't fail the entire operation if custom field fetching fails
              customFields = [];
            }

            // Build the user-tenant data object
            userTenantData = {
              userId: mapping.userId,
              tenantId: mapping.tenantId,
              status: mapping.status,
              createdAt: mapping.createdAt,
              updatedAt: mapping.updatedAt,
              user: user ? {
                username: user.username,
                firstName: user.firstName,
                middleName: user.middleName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile
              } : null,
              tenant: tenant ? {
                name: tenant.name,
                domain: tenant.domain
              } : null,
              role: roleInfo,
              customFields: customFields || [],
              eventTimestamp: new Date().toISOString()
            };
          }
        } catch (error) {
          LoggerUtil.error(
            API_RESPONSES.ERROR_FAILED_FETCH_USER_TENANT_DATA,
            `Error: ${error.message}`,
            apiId
          );
          // Return at least the userId and tenantId if we can't fetch complete data
          userTenantData = { userId, tenantId };
        }
      }
      await this.kafkaService.publishUserTenantEvent(eventType, userTenantData, userId);
      LoggerUtil.log(
        API_RESPONSES.LOG_USER_TENANT_EVENT_PUBLISHED(eventType, userId, tenantId),
        apiId
      );
    } catch (error) {
      LoggerUtil.error(
        API_RESPONSES.ERROR_FAILED_PUBLISH_USER_TENANT_EVENT(eventType),
        `Error: ${error.message}`,
        apiId
      );
      // Don't throw the error to avoid affecting the main operation
    }
  }

}
