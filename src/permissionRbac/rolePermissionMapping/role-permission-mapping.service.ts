import { HttpStatus, Injectable } from "@nestjs/common";
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
    private rolePermissionRepository: Repository<RolePermission>
  ) {}

  //getPermission for middleware
  public async getPermissionForMiddleware(
    roleTitle: string,
    apiPath: string
  ): Promise<any> {
    try {
      const result = await this.rolePermissionRepository.find({
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
      const result = await this.rolePermissionRepository.find({
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
    const apiId = "api.create.permission";
    try {
      const result = await this.rolePermissionRepository.save({
        roleTitle: permissionCreateDto.roleTitle,
        apiPath: permissionCreateDto.apiPath,
        requestType: permissionCreateDto.requestType,
        module: permissionCreateDto.module,
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
    rolePermissionCreateDto: RolePermissionCreateDto,
    response: Response
  ): Promise<any> {
    const apiId = "api.update.permission";
    try {
      const result = await this.rolePermissionRepository.update(
        rolePermissionCreateDto.rolePermissionId,
        {
          roleTitle: rolePermissionCreateDto.roleTitle,
          apiPath: rolePermissionCreateDto.apiPath,
          requestType: rolePermissionCreateDto.requestType,
          module: rolePermissionCreateDto.module,
        }
      );
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
    rolePermissionId: string,
    response: Response
  ): Promise<any> {
    const apiId = "api.delete.permission";
    try {
      const result = await this.rolePermissionRepository.delete(
        rolePermissionId
      );
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
