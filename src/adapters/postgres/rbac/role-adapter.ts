import { HttpStatus, Injectable } from "@nestjs/common";
import { Role } from "src/rbac/role/entities/role.entity";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  CreateRolesDto,
  RoleDto,
  RolesResponseDto,
} from "../../../rbac/role/dto/role.dto";
import { RoleSearchDto } from "../../../rbac/role/dto/role-search.dto";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Privilege } from "src/rbac/privilege/entities/privilege.entity";
import { isUUID } from "class-validator";
import APIResponse from "src/common/responses/response";
import { Response } from "express";
import { APIID } from "src/common/utils/api-id.config";
import { validate as uuidValidate } from 'uuid';
import { API_RESPONSES } from "@utils/response.messages";


@Injectable()
export class PostgresRoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRoleMapping)
    private readonly userRoleMappingRepository: Repository<UserRoleMapping>,
    @InjectRepository(RolePrivilegeMapping)
    private readonly roleprivilegeMappingRepository: Repository<RolePrivilegeMapping>
  ) { }
  public async createRole(
    request: any,
    createRolesDto: CreateRolesDto,
    response: Response
  ) {
    const apiId = APIID.ROLE_CREATE;
    const roles = [];
    const errors = [];

    try {
      if (createRolesDto?.tenantId?.trim() !== '' && !uuidValidate(createRolesDto?.tenantId)) {
        return APIResponse.error(
          response,
          apiId,
          `Please enter valid tenantId or keep blank`,
          "Invalid Tenant Id",
          HttpStatus.BAD_REQUEST
        );
      } else if (uuidValidate(createRolesDto?.tenantId)) {
        const tenant = await this.checkTenantID(createRolesDto.tenantId);
        if (!tenant) {
          return APIResponse.error(
            response,
            apiId,
            `Tenant Id not found`,
            "Tenant Id not found",
            HttpStatus.NOT_FOUND
          );
        }
      }

      // Convert role name to lowercase
      const tenantId = createRolesDto.tenantId;
      for (const roleDto of createRolesDto.roles) {
        const code = roleDto.title.toLowerCase().replace(/\s+/g, "_");

        // Check if role name already exists
        const existingRole = await this.roleRepository.findOne({
          where: { code: code, tenantId: tenantId ? tenantId : IsNull() },
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
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: request.user.userId, // Assuming you have a user object in the request
          updatedBy: request.user.userId,
          tenantId: tenantId ? tenantId : null, // Add the tenantId to the RoleDto
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

  public async updateRole(
    roleId: string,
    request: any,
    roleDto: RoleDto,
    response: Response
  ) {
    const apiId = APIID.ROLE_UPDATE;
    try {
      const code = roleDto.title.toLowerCase().replace(/\s+/g, "_");
      roleDto.code = code;
      const result = await this.roleRepository.update(roleId, roleDto);
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

  public async searchRole(roleSearchDto: RoleSearchDto, response: Response) {
    const apiId = APIID.ROLE_SEARCH;
    try {
      const { limit, offset, filters } = roleSearchDto;

      if (roleSearchDto.filters['roleId'] && !isUUID(roleSearchDto.filters['roleId'])) {
        return APIResponse.error(
          response,
          apiId,
          `Role Id must be a valid UUID`,
          "Invalid UUID",
          HttpStatus.BAD_REQUEST
        );
      }
      if (roleSearchDto.filters['tenantId'] && !isUUID(roleSearchDto.filters['tenantId'])) {
        
        return APIResponse.error(
          response,
          apiId,
          `Tenant Id must be a valid UUID`,
          "Invalid UUID",
          HttpStatus.BAD_REQUEST
        );
      }

      const whereClause: any = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          whereClause[key] = value;
        });
      }

      const getRoleDetails = await this.roleRepository.find({
        where: whereClause,
        take: limit || 10,
        skip: offset || 0,
      });

      const totalCount = await this.roleRepository.count({ where: whereClause });

      if (totalCount === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.ROLE_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        { getRoleDetails, totalCount },
        HttpStatus.OK,
        API_RESPONSES.ROLE_SEARCH_SUCCESS
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

  public async findRoleData(id: string) {
    const data = await this.roleRepository.find({
      where: {
        tenantId: id,
      },
      select: ["roleId", "title", "code"],
    });
    return data;
  }

  public async findUserRoleData(userId: string, tenantId: string) {
    const userRoleData = await this.userRoleMappingRepository
      .createQueryBuilder("urp")
      .innerJoin(Role, "r", "r.roleId=urp.roleId")
      .select(["urp.roleId as roleid", "r.title as title", "r.code as code"])
      .where("urp.userId= :userId", { userId })
      .andWhere("urp.tenantId=:tenantId", { tenantId })
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
