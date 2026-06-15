import { HttpStatus, Injectable } from "@nestjs/common";
import { AuditLoggerService } from "@tekdi/audit-logger/nestjs";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { RolePermission } from "./entities/rolePermissionMapping";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { RolePermissionCreateDto } from "./dto/role-permission-create-dto";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>,
    private readonly auditLoggerService: AuditLoggerService
  ) {}

  //getPermission for middleware
  public async getPermissionForMiddleware(
    roleTitle: string,
    apiPath: string
  ): Promise<any> {
    try {
      let result = await this.rolePermissionRepository.find({
        where: { roleTitle: roleTitle, apiPath: apiPath },
      });
      LoggerUtil.log("Permission from DB: " + JSON.stringify(result));
      return result;
    } catch (error) {
      return error;
    }
  }
  public async getPermission(
    roleTitle: string,
    apiPath: string,
    response: Response
  ): Promise<any> {
    const apiId = "api.get.permission";
    try {
      let result = await this.rolePermissionRepository.find({
        where: { roleTitle: roleTitle, apiPath: apiPath },
      });
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission fetch successfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "Failed to fetch permission data.",
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //create permission
  public async createPermission(
    request: any,
    permissionCreateDto: RolePermissionCreateDto,
    response: Response
  ): Promise<any> {
    const apiId = "api.create.permission";
    try {
      let result = await this.rolePermissionRepository.save({
        roleTitle: permissionCreateDto.roleTitle,
        apiPath: permissionCreateDto.apiPath,
        requestType: permissionCreateDto.requestType,
        module: permissionCreateDto.module,
      });

      // Audit Log
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION_MAPPING",
        entityId: result.rolePermissionId || "new",
        eventAction: "CREATED",
        actorId: request["user"]?.userId || "system",
        actorName: request["user"]?.name || "Unknown",
        userRole: request["user"]?.role || "Unknown",
        context: {
          ipAddress: request?.ip,
          platform: request?.headers?.["user-agent"],
          roleTitle: permissionCreateDto.roleTitle,
          apiPath: permissionCreateDto.apiPath
        }
      });

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission added succesfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "Failed to add permission data.",
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //update permission by permissionId
  public async updatePermission(
    request: any,
    rolePermissionCreateDto: RolePermissionCreateDto,
    response: Response
  ): Promise<any> {
    const apiId = "api.update.permission";
    try {
      let result = await this.rolePermissionRepository.update(
        rolePermissionCreateDto.rolePermissionId,
        {
          roleTitle: rolePermissionCreateDto.roleTitle,
          apiPath: rolePermissionCreateDto.apiPath,
          requestType: rolePermissionCreateDto.requestType,
          module: rolePermissionCreateDto.module,
        }
      );

      // Audit Log
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION_MAPPING",
        entityId: rolePermissionCreateDto.rolePermissionId,
        eventAction: "UPDATED",
        actorId: request["user"]?.userId || "system",
        actorName: request["user"]?.name || "Unknown",
        userRole: request["user"]?.role || "Unknown",
        context: {
          ipAddress: request?.ip,
          platform: request?.headers?.["user-agent"],
          roleTitle: rolePermissionCreateDto.roleTitle,
          apiPath: rolePermissionCreateDto.apiPath
        }
      });

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission updated succesfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "Failed to update permission data.",
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //delete permission by permissionId
  public async deletePermission(
    request: any,
    rolePermissionId: string,
    response: Response
  ): Promise<any> {
    const apiId = "api.delete.permission";
    try {
      let result = await this.rolePermissionRepository.delete(rolePermissionId);

      // Audit Log
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION_MAPPING",
        entityId: rolePermissionId,
        eventAction: "DELETED",
        actorId: request["user"]?.userId || "system",
        actorName: request["user"]?.name || "Unknown",
        userRole: request["user"]?.role || "Unknown",
        context: {
          ipAddress: request?.ip,
          platform: request?.headers?.["user-agent"]
        }
      });

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission deleted succesfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "Failed to delete permission data.",
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
