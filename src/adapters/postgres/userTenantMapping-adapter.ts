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
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { IServicelocatorAssignTenant } from "../usertenantmappinglocator";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { isUUID } from "class-validator";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { PostgresUserService } from "./user-adapter";
import { PostgresFieldsService } from "./fields-adapter";

@Injectable()
export class PostgresAssignTenantService
  implements IServicelocatorAssignTenant {
  constructor(
    @InjectRepository(UserTenantMapping)
    private userTenantMappingRepository: Repository<UserTenantMapping>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenants)
    private tenantsRepository: Repository<Tenants>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRoleMapping)
    private userRoleMappingRepository: Repository<UserRoleMapping>,
    private postgresUserService: PostgresUserService,
    private fieldsService: PostgresFieldsService
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
    const [userExist, tenantExist, existingMapping, roleExist] = await Promise.all([
      this.userRepository.findOne({ where: { userId } }),
      this.tenantsRepository.findOne({ where: { tenantId } }),
      this.userTenantMappingRepository.findOne({ where: { userId, tenantId } }),
      this.roleRepository.findOne({ where: { roleId } }),
    ]);

    if (!userExist) {
      errors.push({ errorMessage: `User ${userId} does not exist.` });
      return false;
    }

    if (!tenantExist) {
      errors.push({ errorMessage: `Tenant ${tenantId} does not exist.` });
      return false;
    }

    if (existingMapping) {
      errors.push({ errorMessage: `User already exists in Tenant ${tenantId}.` });
      return false;
    }

    if (!roleExist) {
      errors.push({ errorMessage: `Role ${roleId} does not exist.` });
      return false;
    }

    // Validate custom fields if provided
    if (customField && customField.length > 0) {
      // Transform DTO to match the structure expected by PostgresUserService.validateCustomField
      const transformedDto = {
        customFields: customField, // Note: PostgresUserService expects 'customFields' not 'customField'
        tenantCohortRoleMapping: [{ tenantId }, { roleId }] // Provide tenantId in expected structure
      };

      // Use existing validateCustomField from PostgresUserService
      const customFieldError = await this.postgresUserService.validateCustomField(
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

      const { userId, tenantId, roleId, customField = [] } = assignTenantMappingDto;
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
        }
      };

      await this.postgresUserService.assignUserToTenantAndRoll(
        tenantsData,
        request["user"].userId,
        'assignedUserToChildTenant'
      );

      LoggerUtil.log(
        `User ${userId} assigned role ${roleId} in tenant ${tenantId}`,
        apiId,
        userId
      );

      // Step 5: Process custom fields if provided
      const createFailures = [];
      if (customField && customField.length > 0) {
        LoggerUtil.log(
          `Processing ${customField.length} custom fields for user ${userId} in tenant ${tenantId}`,
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
        message: `User is successfully added to the Tenant with role.`,
        createFailures: createFailures.length > 0 ? createFailures : undefined
      };

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "User added to tenant with role successfully."
      );
    } catch (error) {
      console.log('error', error);
      const errorMessage = error?.message || "Something went wrong";
      LoggerUtil.error(
        `Error in userTenantMapping for user ${assignTenantMappingDto.userId}`,
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
          "No tenant mappings found for this user",
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        { mappings, totalCount: mappings.length },
        HttpStatus.OK,
        "User tenant mappings retrieved successfully"
      );

    } catch (error) {
      LoggerUtil.error(
        "SERVER_ERROR",
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
          `User-Tenant mapping not found for userId: ${userId} and tenantId: ${tenantId}`,
          HttpStatus.NOT_FOUND
        );
      }

      // Update the status
      existingMapping.status = updateStatusDto.status;
      existingMapping.updatedBy = request["user"].userId;
      existingMapping.updatedAt = new Date();

      await this.userTenantMappingRepository.save(existingMapping);

      LoggerUtil.log(
        `Successfully updated status for user ${userId} in tenant ${tenantId}`,
        apiId,
        userId
      );

      // Construct response
      const result = {
        userId: userId,
        tenantId: tenantId,
        status: existingMapping.status,
        message: `User-Tenant mapping status updated successfully.`,
      };

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "User-Tenant mapping status updated successfully."
      );
    } catch (error) {
      console.log('error', error);
      const errorMessage = error?.message || "Something went wrong";
      LoggerUtil.error(
        `Error in updateAssignTenantStatus for user ${userId} and tenant ${tenantId}`,
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

}
