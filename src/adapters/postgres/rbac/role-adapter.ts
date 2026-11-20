import { HttpStatus, Injectable } from "@nestjs/common";
import {
  COHORT_ROLE_TYPE,
  DEFAULT_ROLE_TYPE,
  Role,
  ROLE_TYPES,
} from "src/rbac/role/entities/role.entity";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  CreateRolesDto,
  ROLE_CODE_PATTERN,
  RoleDto,
  RolesResponseDto,
  UpdateRoleDto,
} from "../../../rbac/role/dto/role.dto";
import { RoleSearchDto } from "../../../rbac/role/dto/role-search.dto";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Privilege } from "src/rbac/privilege/entities/privilege.entity";
import { isUUID } from "class-validator";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { CacheService } from "src/cache/cache.service";

@Injectable()
export class PostgresRoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRoleMapping)
    private readonly userRoleMappingRepository: Repository<UserRoleMapping>,
    @InjectRepository(RolePrivilegeMapping)
    private readonly roleprivilegeMappingRepository: Repository<RolePrivilegeMapping>,
    private readonly cacheService: CacheService
  ) {}
  public async createRole(
    request: any,
    createRolesDto: CreateRolesDto,
    response: Response
  ) {
    const apiId = APIID.ROLE_CREATE;
    const tenant = await this.checkTenantID(createRolesDto.tenantId);
    if (!tenant) {
      return APIResponse.error(
        response,
        apiId,
        `Please enter valid tenantId`,
        "Invalid Tenant Id",
        HttpStatus.BAD_REQUEST
      );
    }
    const roles = [];
    const errors = [];
    try {
      // Convert role name to lowercase
      for (const roleDto of createRolesDto.roles) {
        const tenantId = createRolesDto.tenantId;
        // Task 8: an explicit code wins; otherwise it is made from the title as before
        const code = roleDto.code || this.codeFromTitle(roleDto.title);
        if (!ROLE_CODE_PATTERN.test(code)) {
          errors.push({
            errorMessage: `Role '${roleDto.title}': send a code made of lower-case letters, digits and _ (the title gives '${code}').`,
          });
          continue;
        }

        // Check if role name already exists
        const existingRole = await this.roleRepository.findOne({
          where: { code: code, tenantId: tenantId },
        });
        if (existingRole) {
          errors.push({
            errorMessage: `Combination of this tenantId and the code '${code}' already exists.`,
          });
          continue;
        }

        const newRoleDto = new RoleDto({
          ...roleDto,
          code,
          displayName: roleDto.displayName?.trim() || roleDto.title,
          roleType: roleDto.roleType || DEFAULT_ROLE_TYPE,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: request.user.userId, // Assuming you have a user object in the request
          updatedBy: request.user.userId,
          tenantId, // Add the tenantId to the RoleDto
        });
        // Convert roleDto to lowercase
        // const response = await this.roleRepository.save(roleDto);
        const roleEntity = this.roleRepository.create(newRoleDto);

        // Save the role entity to the database
        const response = await this.roleRepository.save(roleEntity);
        roles.push(new RolesResponseDto(response));
      }
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
    return APIResponse.success(
      response,
      apiId,
      { successCount: roles.length, errorCount: errors.length, roles, errors },
      HttpStatus.OK,
      "Role successfully Created"
    );
  }

  public async getRole(roleId: string, request: any, response: Response) {
    const apiId = APIID.ROLE_GET;
    try {
      const [roles, totalCount] = await this.roleRepository.findAndCount({
        where: { roleId },
      });
      return APIResponse.success(
        response,
        apiId,
        { roles, totalCount },
        HttpStatus.OK,
        "Roles fetched successfully"
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

  /**
   * Task 8: changes the title, display name, description and (with limits) the role type.
   * The code is never changed: the middleware role checks and the apps use it.
   */
  public async updateRole(
    roleId: string,
    request: any,
    roleDto: UpdateRoleDto,
    response: Response
  ) {
    const apiId = APIID.ROLE_UPDATE;
    try {
      const role = await this.roleRepository.findOne({ where: { roleId } });
      if (!role) {
        return APIResponse.error(
          response,
          apiId,
          "Role not found",
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }

      const update: Partial<Role> = {};
      if (roleDto.title !== undefined) update.title = roleDto.title.trim();
      if (roleDto.displayName !== undefined) {
        update.displayName = roleDto.displayName.trim() || null;
      }
      if (roleDto.description !== undefined) {
        update.description = roleDto.description;
      }
      if (
        roleDto.roleType !== undefined &&
        roleDto.roleType !== role.roleType
      ) {
        const refusal = await this.roleTypeChangeRefusal(
          role,
          roleDto.roleType
        );
        if (refusal) {
          return APIResponse.error(
            response,
            apiId,
            refusal,
            "Bad Request",
            HttpStatus.BAD_REQUEST
          );
        }
        update.roleType = roleDto.roleType;
      }
      if (Object.keys(update).length === 0) {
        return APIResponse.error(
          response,
          apiId,
          "Send at least one of title, displayName, roleType, description",
          "Bad Request",
          HttpStatus.BAD_REQUEST
        );
      }
      update.updatedBy = request?.user?.userId ?? role.updatedBy;

      const result = await this.roleRepository.update(roleId, update);
      return APIResponse.success(
        response,
        apiId,
        { rowCount: result.affected },
        HttpStatus.OK,
        "Roles Updated successful"
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

  /** Why a role's type may not change, or null when it may */
  private async roleTypeChangeRefusal(
    role: Role,
    roleType: string
  ): Promise<string | null> {
    if (role.isSystemRole) {
      return "The role type of a system role cannot be changed.";
    }
    // A group role must never be held as a user's own role, and the reverse
    if (role.roleType === COHORT_ROLE_TYPE || roleType === COHORT_ROLE_TYPE) {
      const holders = await this.userRoleMappingRepository.count({
        where: { roleId: role.roleId },
      });
      if (holders > 0) {
        return `${holders} user(s) hold this role, so it cannot become or stop being a group role.`;
      }
    }
    return null;
  }

  private codeFromTitle(title: string): string {
    return (title || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  /**
   * Task 8: filters.roleType (one type or a list). Left out: every type except cohort, so the
   * existing role dropdowns (own role of a user) never offer a group role.
   * Returns null when a value is not a role type.
   */
  private toRoleTypeFilter(value: unknown): string[] | null {
    if (value === undefined || value === null || value === "") {
      return ROLE_TYPES.filter((t) => t !== COHORT_ROLE_TYPE);
    }
    const list = (Array.isArray(value) ? value : String(value).split(","))
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (
      list.length === 0 ||
      list.some((v) => !(ROLE_TYPES as readonly string[]).includes(v))
    ) {
      return null;
    }
    return list;
  }

  public async searchRole(roleSearchDto: RoleSearchDto, response: Response) {
    const apiId = APIID.ROLE_SEARCH;
    try {
      let { limit } = roleSearchDto;
      const { page, filters } = roleSearchDto;

      let offset = 0;
      if (page > 1) {
        offset = parseInt(limit) * (page - 1);
      }

      if (limit.trim() === "") {
        limit = "0";
      }

      const whereClause: any = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause[key] = value;
        });
      }
      if (whereClause.userId && !whereClause.tenantId) {
        return APIResponse.error(
          response,
          APIID.ROLE_SEARCH,
          `Please Enter Tenenat id or Valid Filter`,
          "Invalid Tenant Id or Valid Filter",
          HttpStatus.BAD_REQUEST
        );
      }
      if (whereClause.field && !["Privilege"].includes(whereClause?.field)) {
        return APIResponse.error(
          response,
          APIID.ROLE_SEARCH,
          `Please Enter valid field value.`,
          "Invalid field value.",
          HttpStatus.BAD_REQUEST
        );
      }

      // isSystemRole is an optional filter; accept boolean or "true"/"false".
      let isSystemRole: boolean | undefined;
      if (
        whereClause.isSystemRole !== undefined &&
        whereClause.isSystemRole !== null &&
        whereClause.isSystemRole !== ""
      ) {
        if (typeof whereClause.isSystemRole === "boolean") {
          isSystemRole = whereClause.isSystemRole;
        } else if (
          typeof whereClause.isSystemRole === "string" &&
          ["true", "false"].includes(whereClause.isSystemRole.toLowerCase())
        ) {
          isSystemRole = whereClause.isSystemRole.toLowerCase() === "true";
        } else {
          return APIResponse.error(
            response,
            APIID.ROLE_SEARCH,
            `Please Enter valid isSystemRole value (true or false).`,
            "Invalid isSystemRole value.",
            HttpStatus.BAD_REQUEST
          );
        }
      }
      const roleTypes = this.toRoleTypeFilter(whereClause.roleType);
      if (!roleTypes) {
        return APIResponse.error(
          response,
          APIID.ROLE_SEARCH,
          `roleType must be one or more of: ${ROLE_TYPES.join(", ")}`,
          "Invalid roleType value.",
          HttpStatus.BAD_REQUEST
        );
      }
      if (
        whereClause.userId &&
        whereClause.tenantId &&
        whereClause.field === "Privilege"
      ) {
        const userRoleMappingData = await this.findUserRoleData(
          whereClause.userId,
          whereClause.tenantId,
          isSystemRole
        );
        const roleIds = userRoleMappingData.map((data) => data.roleid);

        const result = await this.findPrivilegeByRoleId(roleIds);

        const roles = userRoleMappingData.map((data) => {
          const roleResult = result.find(
            (privilegeData) => privilegeData.roleid === data.roleid
          );
          return {
            roleId: data.roleid,
            title: data.title,
            code: data.code,
            displayName: data.displayname || data.title,
            roleType: data.roletype,
            privileges: roleResult ? roleResult : [],
          };
        });
        return APIResponse.success(
          response,
          apiId,
          roles,
          HttpStatus.OK,
          "Role For User with Privileges fetched successfully."
        );
      } else if (
        whereClause.userId &&
        whereClause.tenantId &&
        !whereClause.field
      ) {
        const data = await this.findUserRoleData(
          whereClause.userId,
          whereClause.tenantId,
          isSystemRole
        );
        return APIResponse.success(
          response,
          apiId,
          data,
          HttpStatus.OK,
          "Role For User Id fetched successfully."
        );
      } else if (whereClause.tenantId && whereClause.field === "Privilege") {
        const userRoleData = await this.findRoleData(
          whereClause.tenantId,
          isSystemRole,
          roleTypes
        );
        const result = await this.findPrivilegeByRoleId(
          userRoleData.map((data) => data.roleId)
        );
        const roles = userRoleData.map((data) => {
          const roleResult = result.find(
            (privilegeData) => privilegeData.roleid === data.roleId
          );
          return {
            roleId: data.roleId,
            title: data.title,
            code: data.code,
            displayName: data.displayName,
            roleType: data.roleType,
            privileges: roleResult ? roleResult : [],
          };
        });
        return APIResponse.success(
          response,
          apiId,
          roles,
          HttpStatus.OK,
          "Role For Tenant with Privileges fetched successfully."
        );
      } else if (whereClause.tenantId && !whereClause.field) {
        const data = await this.findRoleData(
          whereClause.tenantId,
          isSystemRole,
          roleTypes
        );
        return APIResponse.success(
          response,
          apiId,
          data,
          HttpStatus.OK,
          "Role For Tenant fetched successfully."
        );
      } else {
        return APIResponse.error(
          response,
          APIID.ROLE_SEARCH,
          `Please Enter Valid Filter`,
          "Invalid Filter",
          HttpStatus.BAD_REQUEST
        );
      }
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

  public async deleteRole(roleId: string, res: Response) {
    const apiId = APIID.ROLE_DELETE;
    try {
      if (!isUUID(roleId)) {
        return APIResponse.error(
          res,
          apiId,
          `Please Enter valid (UUID)`,
          "Invalid UUID",
          HttpStatus.BAD_REQUEST
        );
      }

      const roleToDelete = await this.roleRepository.findOne({
        where: { roleId: roleId },
      });

      if (!roleToDelete) {
        return APIResponse.error(
          res,
          apiId,
          `Role not found`,
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }
      // Delete the role
      const response = await this.roleRepository.delete(roleId);

      // Delete entries from RolePrivilegesMapping table associated with the roleId
      const rolePrivilegesDeleteResponse =
        await this.roleprivilegeMappingRepository.delete({
          roleId: roleId,
        });

      const userRoleDeleteResponse =
        await this.userRoleMappingRepository.delete({
          roleId: roleId,
        });

      // Any user who held this role must lose its privileges on next
      // rbac_token issuance; drop cached entries for this tenant now.
      await this.cacheService.delByPattern(
        `rbac:privileges:*:${roleToDelete.tenantId}`
      );

      return APIResponse.success(
        res,
        apiId,
        { rowCount: response.affected },
        HttpStatus.OK,
        "Role deleted successfully."
      );
    } catch (e) {
      const errorMessage = e.message || "Internal server error";
      return APIResponse.error(
        res,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Roles of a tenant. Task 8: also returns displayName (the title when empty) and roleType;
   * `roleTypes` limits the types (callers that pass none get every type).
   */
  public async findRoleData(
    id: string,
    isSystemRole?: boolean,
    roleTypes?: string[]
  ) {
    const where: any = {
      tenantId: id,
    };
    if (isSystemRole !== undefined) {
      where.isSystemRole = isSystemRole;
    }
    if (roleTypes?.length) {
      where.roleType = In(roleTypes);
    }
    const data = await this.roleRepository.find({
      where,
      select: ["roleId", "title", "code", "displayName", "roleType"],
      order: { title: "ASC" },
    });
    return data.map((role) => ({
      ...role,
      displayName: role.displayName || role.title,
    }));
  }

  public async findUserRoleData(
    userId: string,
    tenantId: string,
    isSystemRole?: boolean
  ) {
    const query = this.userRoleMappingRepository
      .createQueryBuilder("urp")
      .innerJoin(Role, "r", "r.roleId=urp.roleId")
      .select([
        "urp.roleId as roleid",
        "r.title as title",
        "r.code as code",
        "r.displayName as displayname",
        "r.roleType as roletype",
      ])
      .where("urp.userId= :userId", { userId })
      .andWhere("urp.tenantId=:tenantId", { tenantId });

    if (isSystemRole !== undefined) {
      query.andWhere("r.isSystemRole = :isSystemRole", { isSystemRole });
    }

    const userRoleData = await query.getRawMany();
    return userRoleData;
  }

  /**
   * Batch load user role data for multiple tenants in a single query
   * Optimizes N+1 query problem by fetching all roles at once
   */
  public async findUserRoleDataBatch(userId: string, tenantIds: string[]) {
    if (!tenantIds || tenantIds.length === 0) {
      return [];
    }
    const userRoleData = await this.userRoleMappingRepository
      .createQueryBuilder("urp")
      .innerJoin(Role, "r", "r.roleId=urp.roleId")
      .select([
        "urp.roleId as roleid",
        "r.title as title",
        "r.code as code",
        "urp.tenantId as tenantId",
      ])
      .where("urp.userId = :userId", { userId })
      .andWhere("urp.tenantId IN (:...tenantIds)", { tenantIds })
      .getRawMany();
    return userRoleData;
  }

  public async findPrivilegeByRoleId(roleIds: string[]) {
    const privileges = await this.roleprivilegeMappingRepository
      .createQueryBuilder("rpm")
      .innerJoin(Privilege, "p", "p.privilegeId=rpm.privilegeId")
      .select([
        "p.privilegeId as privilegeId",
        "p.name as name",
        "p.code as code",
        "rpm.roleId as roleId",
      ])
      .where("rpm.roleId IN (:...roleIds)", { roleIds })
      .getRawMany();
    return privileges;
  }

  public async checkTenantID(tenantId) {
    const query = `SELECT "tenantId" FROM public."Tenants"
        where "tenantId"= $1 `;
    const response = await this.roleRepository.query(query, [tenantId]);
    if (response.length > 0) {
      return true;
    }
    return false;
  }
}
