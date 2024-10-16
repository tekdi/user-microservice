import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreatePrivilegeRoleDto } from "src/rbac/assign-privilege/dto/create-assign-privilege.dto";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { isUUID } from "class-validator";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";

@Injectable()
export class PostgresAssignPrivilegeService {
  constructor(
    @InjectRepository(RolePrivilegeMapping)
    private rolePrivilegeMappingRepository: Repository<RolePrivilegeMapping>
  ) {}
  public async createPrivilegeRole(
    request: Request,
    createPrivilegeRoleDto: CreatePrivilegeRoleDto,
    response: Response
  ) {
    const apiId = APIID.ASSIGNPRIVILEGE_CREATE;
    try {
      let result;
      if (createPrivilegeRoleDto.deleteOld) {
        await this.deleteByRoleId(createPrivilegeRoleDto.roleId);
      }
      const privilegeRoles = createPrivilegeRoleDto.privilegeId.map(
        (privilegeId) => ({
          roleId: createPrivilegeRoleDto.roleId,
          tenantId: createPrivilegeRoleDto.tenantId,
          privilegeId,
        })
      );
      const existingPrivileges = await this.rolePrivilegeMappingRepository.find(
        {
          where: {
            roleId: createPrivilegeRoleDto.roleId,
            tenantId: createPrivilegeRoleDto.tenantId,
            privilegeId: In(createPrivilegeRoleDto.privilegeId),
          },
        }
      );

      const newPrivileges = privilegeRoles.filter((privilegeRole) => {
        return !existingPrivileges.some(
          (existing) => existing.privilegeId === privilegeRole.privilegeId
        );
      });

      for (const data of newPrivileges) {
        result = await this.rolePrivilegeMappingRepository.save(data);
      }

      return await APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        "Privileges assigned successfully."
      );
    } catch (error) {
      if (error.code === "23503") {
        return APIResponse.error(
          response,
          apiId,
          "Not Found",
          `Privilege Id or Role Id Doesn't Exist in Database.`,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.error(
        response,
        apiId,
        "Not Found",
        `Error is: ${error}.`,
        HttpStatus.NOT_FOUND
      );
    }
  }

  public async deleteByRoleId(roleId: string) {
    try {
      await this.rolePrivilegeMappingRepository.delete({ roleId });
    } catch (error) {
      throw error;
    }
  }

  public async getPrivilegeRole(
    roleId: string,
    request: Request,
    response: Response
  ) {
    const apiId = APIID.ASSIGNPRIVILEGE_GET;
    try {
      if (!isUUID(roleId)) {
        return APIResponse.error(
          response,
          apiId,
          "Bad Request",
          "Please Enter Valid User ID.",
          HttpStatus.BAD_REQUEST
        );
      }
      const privileges = await this.getPrivilegesForRoleAndTenant(
        roleId,
        request.headers["tenantid"]
      );

      if (!privileges) {
        return APIResponse.error(
          response,
          apiId,
          "Not Found",
          "No Role Found.",
          HttpStatus.NOT_FOUND
        );
      }

      return await APIResponse.success(
        response,
        apiId,
        privileges,
        HttpStatus.OK,
        "Privileges for role fetched successfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        `Something went wrong.`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async checkExistingRole(roleId) {
    const result = await this.rolePrivilegeMappingRepository.find({
      where: { roleId },
    });
    return result;
  }
  async getPrivilegesForRoleAndTenant(roleId: string, tenantId: string) {
    const privileges = await this.rolePrivilegeMappingRepository.find({
      where: { roleId, tenantId },
    });
    return privileges;
  }
}
