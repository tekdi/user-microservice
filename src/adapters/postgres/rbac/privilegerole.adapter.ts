import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreatePrivilegeRoleDto } from "src/rbac/assign-privilege/dto/create-assign-privilege.dto";
import { UpdateRolePrivilegesDto } from "src/rbac/assign-privilege/dto/update-assign-privilege.dto";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { Privilege } from "src/rbac/privilege/entities/privilege.entity";
import { isUUID } from "class-validator";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { CacheService } from "src/cache/cache.service";

@Injectable()
export class PostgresAssignPrivilegeService {
  constructor(
    @InjectRepository(RolePrivilegeMapping)
    private rolePrivilegeMappingRepository: Repository<RolePrivilegeMapping>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private readonly cacheService: CacheService
  ) {}
  public async createPrivilegeRole(
    request: any,
    createPrivilegeRoleDto: CreatePrivilegeRoleDto,
    response: Response
  ) {
    const apiId = APIID.ASSIGNPRIVILEGE_CREATE;
    try {
      const role = await this.roleRepository.findOne({
        where: { roleId: createPrivilegeRoleDto.roleId },
      });
      if (role && role.isPermissionEditable === false) {
        return APIResponse.error(
          response,
          apiId,
          "Forbidden",
          "Permissions for this role are locked and cannot be edited.",
          HttpStatus.FORBIDDEN
        );
      }

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

      // Any user holding this role gets their effective privileges recomputed
      // on next rbac_token issuance; drop cached entries for this tenant now.
      await this.cacheService.delByPattern(
        `rbac:privileges:*:${createPrivilegeRoleDto.tenantId}`
      );

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

  /**
   * Applies an add-list and a remove-list to a role's privileges in one call
   * (e.g. a dashboard checkbox grid toggling several rows before one Save).
   */
  public async updateRolePrivileges(
    roleId: string,
    dto: UpdateRolePrivilegesDto,
    response: Response
  ) {
    const apiId = APIID.ASSIGNPRIVILEGE_UPDATE;
    try {
      if (!isUUID(roleId)) {
        return APIResponse.error(
          response,
          apiId,
          "Bad Request",
          "Please Enter Valid Role ID.",
          HttpStatus.BAD_REQUEST
        );
      }

      const role = await this.roleRepository.findOne({ where: { roleId } });
      if (!role) {
        return APIResponse.error(
          response,
          apiId,
          "Not Found",
          "Role not found.",
          HttpStatus.NOT_FOUND
        );
      }
      if (role.isPermissionEditable === false) {
        return APIResponse.error(
          response,
          apiId,
          "Forbidden",
          "Permissions for this role are locked and cannot be edited.",
          HttpStatus.FORBIDDEN
        );
      }

      const addPrivilegeIds = dto.addPrivilegeIds ?? [];
      const removePrivilegeIds = dto.removePrivilegeIds ?? [];

      const { added, removed } =
        await this.rolePrivilegeMappingRepository.manager.transaction(
          async (manager) => {
            const mappingRepo = manager.getRepository(RolePrivilegeMapping);
            let removedCount = 0;
            let addedCount = 0;

            if (removePrivilegeIds.length) {
              const deleteResult = await mappingRepo.delete({
                roleId,
                tenantId: role.tenantId,
                privilegeId: In(removePrivilegeIds),
              });
              removedCount = deleteResult.affected || 0;
            }

            if (addPrivilegeIds.length) {
              const existingMappings = await mappingRepo.find({
                where: {
                  roleId,
                  tenantId: role.tenantId,
                  privilegeId: In(addPrivilegeIds),
                },
              });
              const alreadyAssigned = new Set(
                existingMappings.map((m) => m.privilegeId)
              );
              const toInsert = addPrivilegeIds
                .filter((privilegeId) => !alreadyAssigned.has(privilegeId))
                .map((privilegeId) => ({
                  roleId,
                  tenantId: role.tenantId,
                  privilegeId,
                }));

              if (toInsert.length) {
                await mappingRepo.save(toInsert);
                addedCount = toInsert.length;
              }
            }

            return { added: addedCount, removed: removedCount };
          }
        );

      await this.cacheService.delByPattern(
        `rbac:privileges:*:${role.tenantId}`
      );

      return await APIResponse.success(
        response,
        apiId,
        { roleId, added, removed },
        HttpStatus.OK,
        "Role privileges updated successfully."
      );
    } catch (error) {
      if (error.code === "23503") {
        return APIResponse.error(
          response,
          apiId,
          "Not Found",
          "One or more Privilege Ids don't exist in the database.",
          HttpStatus.NOT_FOUND
        );
      }
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async deletePrivilegeFromRole(
    roleId: string,
    privilegeId: string,
    tenantId: string,
    response: Response
  ) {
    const apiId = APIID.ASSIGNPRIVILEGE_DELETE;
    try {
      const existing = await this.rolePrivilegeMappingRepository.findOne({
        where: { roleId, privilegeId, tenantId },
      });

      if (!existing) {
        return APIResponse.error(
          response,
          apiId,
          "Not Found",
          "This privilege is not assigned to the role.",
          HttpStatus.NOT_FOUND
        );
      }

      const role = await this.roleRepository.findOne({ where: { roleId } });
      if (role && role.isPermissionEditable === false) {
        return APIResponse.error(
          response,
          apiId,
          "Forbidden",
          "Permissions for this role are locked and cannot be edited.",
          HttpStatus.FORBIDDEN
        );
      }

      await this.rolePrivilegeMappingRepository.delete({
        roleId,
        privilegeId,
        tenantId,
      });

      await this.cacheService.delByPattern(`rbac:privileges:*:${tenantId}`);

      return await APIResponse.success(
        response,
        apiId,
        { roleId, privilegeId },
        HttpStatus.OK,
        "Privilege removed from role successfully."
      );
    } catch (error) {
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
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

  /**
   * Full registry grouped by module/submodule, each entry flagged with
   * whether it's currently assigned to this role — feeds the permission
   * dashboard checkbox matrix (doc §19) directly.
   */
  public async getGroupedPermissionsForRole(
    roleId: string,
    tenantId: string,
    response: Response
  ) {
    const apiId = APIID.ROLE_PERMISSIONS_GET;
    try {
      const [allPrivileges, assignedMappings] = await Promise.all([
        this.rolePrivilegeMappingRepository.manager
          .getRepository(Privilege)
          .find({
            where: { isVisibleInUI: true },
            order: { displayOrder: "ASC" },
          }),
        this.rolePrivilegeMappingRepository.find({
          where: { roleId, tenantId },
        }),
      ]);

      const assignedPrivilegeIds = new Set(
        assignedMappings.map((m) => m.privilegeId)
      );

      const grouped: Record<string, Record<string, any[]>> = {};
      for (const privilege of allPrivileges) {
        const moduleKey = privilege.module || "Uncategorized";
        const submoduleKey = privilege.submodule || "General";
        grouped[moduleKey] = grouped[moduleKey] || {};
        grouped[moduleKey][submoduleKey] =
          grouped[moduleKey][submoduleKey] || [];
        grouped[moduleKey][submoduleKey].push({
          ...privilege,
          assigned: assignedPrivilegeIds.has(privilege.privilegeId),
        });
      }

      return APIResponse.success(
        response,
        apiId,
        grouped,
        HttpStatus.OK,
        "Role permissions fetched successfully."
      );
    } catch (e) {
      const errorMessage = e.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
