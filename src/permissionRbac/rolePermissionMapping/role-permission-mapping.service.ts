import { HttpStatus, Injectable, Inject } from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { RolePermission } from "./entities/rolePermissionMapping";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { RolePermissionCreateDto } from "./dto/role-permission-create-dto";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { AuditLoggerService } from "@tekdi/audit-logger/nestjs";
import { requestContext } from "@utils/request-context";
import { getAuditContext } from "@utils/audit-helper";
@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>,
    @Inject(AuditLoggerService)
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
    permissionCreateDto: RolePermissionCreateDto,
    response: Response
  ): Promise<any> {
    const request = requestContext.getStore() as any;
    const apiId = "api.create.permission";
    try {
      let result = await this.rolePermissionRepository.save({
        roleTitle: permissionCreateDto.roleTitle,
        apiPath: permissionCreateDto.apiPath,
        requestType: permissionCreateDto.requestType,
        module: permissionCreateDto.module,
      });
      const apiRes = APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission added succesfully."
      );
      const auditCtx = getAuditContext();
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION",
        entityId: result.rolePermissionId || "N/A",
        eventAction: "CREATED",
        ...auditCtx
      });
      return apiRes;
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
    rolePermissionCreateDto: RolePermissionCreateDto,
    response: Response
  ): Promise<any> {
    const request = requestContext.getStore() as any;
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
      const apiRes = APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission updated succesfully."
      );
      const auditCtx = getAuditContext();
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION",
        entityId: rolePermissionCreateDto.rolePermissionId || "N/A",
        eventAction: "UPDATED",
        ...auditCtx
      });
      return apiRes;
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
    rolePermissionId: string,
    response: Response
  ): Promise<any> {
    const request = requestContext.getStore() as any;
    const apiId = "api.delete.permission";
    try {
      let result = await this.rolePermissionRepository.delete(rolePermissionId);
      const apiRes = APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Permission deleted succesfully."
      );
      const auditCtx = getAuditContext();
      this.auditLoggerService.emit({
        entityType: "ROLE_PERMISSION",
        entityId: rolePermissionId,
        eventAction: "DELETED",
        ...auditCtx
      });
      return apiRes;
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
