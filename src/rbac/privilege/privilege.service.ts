import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SuccessResponse } from "src/success-response";
import { ErrorResponseTypeOrm } from "src/error-response-typeorm";
import { Privilege } from "src/rbac/privilege/entities/privilege.entity";
import {
  CreatePrivilegesDto,
  PrivilegeDto,
  PrivilegeResponseDto,
} from "src/rbac/privilege/dto/privilege.dto";
import { isUUID } from "class-validator";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
@Injectable()
export class PrivilegeService {
  constructor(
    @InjectRepository(Privilege)
    private privilegeRepository: Repository<Privilege>,
    @InjectRepository(RolePrivilegeMapping)
    private rolePrivilegeMappingRepository: Repository<RolePrivilegeMapping>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>
  ) {}

  public async createPrivilege(
    loggedinUser: any,
    createPrivilegesDto: CreatePrivilegesDto,
    response: Response
  ) {
    const privileges = [];
    const errors = [];
    const apiId = APIID.PRIVILEGE_CREATE;
    try {
      for (const privilegeDto of createPrivilegesDto.privileges) {
        const code = privilegeDto.code;

        // Check if privilege with the same label already exists
        const existingPrivilege = await this.checkExistingPrivilege(code);

        if (existingPrivilege) {
          errors.push({
            errorMessage: `Privilege with the code '${privilegeDto.code}' already exists.`,
          });
          continue; // Skip to the next privilege
        }

        privilegeDto.createdBy = loggedinUser;
        privilegeDto.updatedBy = loggedinUser;

        // Create new privilege
        const privilege = this.privilegeRepository.create(privilegeDto);
        const response = await this.privilegeRepository.save(privilege);
        privileges.push(new PrivilegeResponseDto(response));
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
      {
        successCount: privileges.length,
        errorCount: errors.length,
        privileges,
        errors,
      },
      HttpStatus.CREATED,
      "Privileges successfully Created"
    );
  }

  public async checkExistingPrivilege(code) {
    try {
      const existingPrivilege = await this.privilegeRepository.findOne({
        where: { code },
      });
      return existingPrivilege;
    } catch (error) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: error.message || "Internal server error",
      });
    }
  }

  public async getPrivilege(
    privilegeId: string,
    request: any,
    response: Response
  ) {
    const apiId = APIID.PRIVILEGE_BYPRIVILEGEID;
    try {
      if (!isUUID(privilegeId)) {
        return APIResponse.error(
          response,
          apiId,
          `Please Enter valid PrivilegeId (UUID)`,
          "Invalid PrivilegeId (UUID)",
          HttpStatus.BAD_REQUEST
        );
      }

      const privilege = await this.privilegeRepository.findOne({
        where: { privilegeId },
      });
      if (!privilege) {
        return APIResponse.error(
          response,
          apiId,
          `Privilege not found`,
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        privilege,
        HttpStatus.OK,
        "Privilege fetched successfully"
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

  // public async updatePrivilege(privilegeId: string, request: any, privilegeDto: PrivilegeDto) {
  //     try {
  //         // Get the privilege using the getPrivilege method
  //         const existingPrivilegeResponse = await this.getPrivilege(privilegeId, request);

  //         if (existingPrivilegeResponse instanceof ErrorResponseTypeOrm) {
  //             return existingPrivilegeResponse;
  //         }
  //         // Cast the data property of the SuccessResponse to a Privilege object
  //         const existingPrivilege: Privilege = existingPrivilegeResponse.data as Privilege;

  //         const newLabel = privilegeDto.privilegeName.split(' ').join('');

  //         const result = await this.checkExistingPrivilege(newLabel)

  //         if (result) {
  //             return new ErrorResponseTypeOrm({
  //                 statusCode: HttpStatus.CONFLICT,
  //                 errorMessage: "Privilege with the same name already exists.",
  //             });
  //         }
  //         // Merge the updated data into the existing privilege
  //         const mergedPrivilege = this.privilegeRepository.merge(existingPrivilege, privilegeDto);

  //         mergedPrivilege.label = newLabel;
  //         // Save the updated privilege record
  //         const updatedPrivilegeRecord = await this.privilegeRepository.save(mergedPrivilege);

  //         return new SuccessResponse({
  //             statusCode: HttpStatus.OK,
  //             message: "Privilege updated successfully",
  //             data: updatedPrivilegeRecord
  //         });
  //     } catch (e) {
  //         return new ErrorResponseTypeOrm({
  //             statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //             errorMessage: "Internal server error",
  //         });
  //     }
  // }

  public async getAllPrivilege(request, response: Response) {
    try {
      const [privileges, totalCount] =
        await this.privilegeRepository.findAndCount();
      return APIResponse.success(
        response,
        APIID.ROLE_GET,
        { privileges, totalCount },
        HttpStatus.OK,
        "privileges fetched successfully"
      );
    } catch (e) {
      const errorMessage = e.message || "Internal server error";
      return APIResponse.error(
        response,
        APIID.PRIVILEGE_BYROLEID,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async deletePrivilege(privilegeId: string, res: Response) {
    const apiId = APIID.PRIVILEGE_DELETE;
    try {
      const privilegeToDelete = await this.privilegeRepository.findOne({
        where: { privilegeId: privilegeId },
      });
      if (!privilegeToDelete) {
        return APIResponse.error(
          res,
          apiId,
          `Privilege not found`,
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }
      // Delete the privilege
      const response = await this.privilegeRepository.delete(privilegeId);

      // Delete entries from RolePrivilegesMapping table associated with the privilegeId
      await this.rolePrivilegeMappingRepository.delete({
        privilegeId: privilegeId,
      });
      return APIResponse.success(
        res,
        APIID.PRIVILEGE_DELETE,
        { rowCount: response.affected },
        HttpStatus.OK,
        "Privilege deleted successfully."
      );
    } catch (e) {
      const errorMessage = e.message || "Internal server error";
      return APIResponse.error(
        res,
        APIID.PRIVILEGE_DELETE,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async getPrivilegebyRoleId(
    tenantId,
    roleId,
    request,
    response: Response
  ) {
    const apiId = APIID.PRIVILEGE_BYROLEID;
    if (!isUUID(tenantId) || !isUUID(roleId)) {
      return APIResponse.error(
        response,
        apiId,
        `Please Enter valid tenantId and roleId (UUID)`,
        "Invalid Tenant Id or Role Id",
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const valid = await this.checkValidTenantIdRoleIdCombination(
        tenantId,
        roleId
      );
      if (!valid) {
        return APIResponse.error(
          response,
          apiId,
          `Invalid combination of roleId and tenantId`,
          "Invalid roleId or tenantId ",
          HttpStatus.BAD_REQUEST
        );
      }

      const query = `SELECT r.*, u.*
        FROM public."RolePrivilegesMapping" AS r
        inner JOIN public."Privileges" AS u ON r."privilegeId" = u."privilegeId"
        where r."roleId"=$1`;

      const result = await this.privilegeRepository.query(query, [roleId]);
      const privilegeResponseArray: PrivilegeResponseDto[] = result.map(
        (item: any) => {
          const privilegeDto = new PrivilegeDto(item);
          privilegeDto.title = item.name;
          return new PrivilegeResponseDto(privilegeDto);
        }
      );

      if (!privilegeResponseArray.length) {
        APIResponse.error(
          response,
          apiId,
          `No privileges assigned to the role`,
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        response,
        apiId,
        privilegeResponseArray,
        HttpStatus.OK,
        "privilege fetched successfully by Role Id"
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

  public async checkValidTenantIdRoleIdCombination(tenantId, roleId) {
    try {
      const ValidTenantIdRoleCombination = await this.roleRepository.findOne({
        where: { tenantId: tenantId, roleId: roleId },
      });
      return ValidTenantIdRoleCombination;
    } catch (error) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: error.message || "Internal server error",
      });
    }
  }
}
