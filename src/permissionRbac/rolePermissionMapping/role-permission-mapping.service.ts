import { HttpStatus, Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import APIResponse from "src/common/responses/response";
import { InjectRepository } from "@nestjs/typeorm";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { Request, Response } from "express";
import { RolePermission } from "./entities/rolePermissionMapping";

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>
  ) {}

  //getPermission for middleware
  public async getPermission(roleTitle: string, apiPath: string): Promise<any> {
    let apiId = APIID.TENANT_LIST;
    try {
      let result = await this.rolePermissionRepository.find({
        where: { roleTitle: roleTitle, apiPath: apiPath },
      });
      console.log("result: ", result);
      return result;
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId
      );
      return error;
    }
  }

  public async createRolePermission(
    permissionCreateDto: any,
    response: Response
  ): Promise<Response> {
    let apiId = APIID.TENANT_CREATE;
    try {
      let checkExitsMapping = await this.rolePermissionRepository.find({
        where: {
          apiPath: permissionCreateDto?.apiPath,
          roleTitle: permissionCreateDto?.role,
        },
      });
      if (checkExitsMapping.length > 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TENANT_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      let result = await this.rolePermissionRepository.save(
        permissionCreateDto
      );
      if (result) {
        return APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.CREATED,
          API_RESPONSES.TENANT_CREATE
        );
      }
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
