import { HttpStatus, Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { RolePermission } from "./entities/rolePermissionMapping";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { RolePermissionCreateDto } from "./dto/role-permission-create-dto";
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
      let result = await this.rolePermissionRepository.find({
        where: { roleTitle: roleTitle, apiPath: apiPath },
      });
      console.log("result: ", result);
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
      console.log("result: ", result);
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
      let result = await this.rolePermissionRepository.save({
        roleTitle: permissionCreateDto.roleTitle,
        apiPath: permissionCreateDto.apiPath,
        requestType: permissionCreateDto.requestType,
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
      let result = await this.rolePermissionRepository.update(
        rolePermissionCreateDto.permissionId,
        {
          roleTitle: rolePermissionCreateDto.roleTitle,
          apiPath: rolePermissionCreateDto.apiPath,
          requestType: rolePermissionCreateDto.requestType,
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
      let result = await this.rolePermissionRepository.delete(rolePermissionId);
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
