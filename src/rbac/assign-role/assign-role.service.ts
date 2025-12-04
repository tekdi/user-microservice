import {
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  CreateAssignRoleDto,
  ResponseAssignRoleDto,
} from "src/rbac/assign-role/dto/create-assign-role.dto";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { isUUID } from "class-validator";
import { DeleteAssignRoleDto } from "src/rbac/assign-role/dto/delete-assign-role.dto";
import { Response, Request } from "express";
import { APIID } from "src/common/utils/api-id.config";
import APIResponse from "src/common/responses/response";

@Injectable()
export class AssignRoleService {
  constructor(
    @InjectRepository(UserRoleMapping)
    private readonly userRoleMappingRepository: Repository<UserRoleMapping>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>
  ) {}
  public async createAssignRole(
    request: any,
    createAssignRoleDto: CreateAssignRoleDto,
    response: Response
  ) {
    const apiId = APIID.USERROLE_CREATE;
    try {
      const userId = createAssignRoleDto.userId;
      const roles = createAssignRoleDto.roleId;
      const tenantId = createAssignRoleDto.tenantId;

      // Check if roles array is not empty
      if (!roles || roles.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          `Roles array cannot be empty.`,
          "empty array found",
          HttpStatus.BAD_REQUEST
        );
      }
      const result = [];
      const errors = [];

      for (const roleId of roles) {
        // If role already exists for user, return error response
        const findExistingRole = await this.userRoleMappingRepository.findOne({
          where: {
            userId: userId,
            roleId: roleId,
          },
        });
        if (findExistingRole) {
          errors.push({
            errorMessage: `Role ${roleId} is already assigned to this user.`,
          });
          continue;
        }

        //Rele is belong for this tenent
        const roleExistforTenant = await this.roleRepository.findOne({
          where: {
            roleId: roleId,
            tenantId: tenantId,
          },
        });
        if (!roleExistforTenant) {
          errors.push({
            errorMessage: `Role ${roleId} is not exist for this tenant.`,
          });
          continue;
        }

        const data = await this.userRoleMappingRepository.save({
          userId: userId,
          roleId: roleId,
          tenantId: tenantId,
          createdBy: request["user"].userId,
          updatedBy: request["user"].userId,
        });
        result.push(
          new ResponseAssignRoleDto(
            data,
            `Role assigned successfully to the user in the specified tenant.`
          )
        );
      }

      if (result.length == 0) {
        return APIResponse.error(
          response,
          apiId,
          `Please Enter Valid User ID`,
          "Invalid User ID",
          HttpStatus.BAD_REQUEST
        );
      }
      return APIResponse.success(
        response,
        apiId,
        {
          successCount: result.length,
          errorCount: errors.length,
          result,
          errors,
        },
        HttpStatus.CREATED,
        "Role successfully Created"
      );
    } catch (error) {
      if (error.code === "23503") {
        return APIResponse.error(
          response,
          apiId,
          `User Id or Role Id Doesn't Exist in Database`,
          "Not found",
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

  public async getAssignedRole(
    userId: string,
    request: Request,
    response: Response
  ) {
    const apiId = APIID.USERROLE_GET;
    try {
      if (!isUUID(userId)) {
        return APIResponse.error(
          response,
          apiId,
          `Please Enter Valid User ID`,
          "Invalid User ID",
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.checkExistingRole(userId);
      if (!result) {
        return APIResponse.error(
          response,
          apiId,
          `User Id or Role Id Doesn't Exist in Database`,
          "Not found",
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "User role fetched successfully"
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

  public async deleteAssignedRole(
    deleteAssignRoleDto: DeleteAssignRoleDto,
    res: Response
  ) {
    const apiId = APIID.USERROLE_DELETE;
    try {
      // Validate userId format
      if (!isUUID(deleteAssignRoleDto.userId)) {
        return APIResponse.error(
          res,
          apiId,
          `Invalid userId format. Please provide a valid UUID.`,
          "Invalid UUID",
          HttpStatus.BAD_REQUEST
        );
      }
      // Validate roleId format
      for (const roleId of deleteAssignRoleDto.roleId) {
        if (!isUUID(roleId)) {
          return APIResponse.error(
            res,
            apiId,
            `Invalid roleId format. Please provide valid UUIDs`,
            "Invalid UUID",
            HttpStatus.BAD_REQUEST
          );
        }
      }
      // Check if the userId exists in userRoleMapping table
      const userExists = await this.userRoleMappingRepository.findOne({
        where: { userId: deleteAssignRoleDto.userId },
      });
      if (!userExists) {
        return APIResponse.error(
          res,
          apiId,
          `User not found in userRoleMapping table`,
          "User not found",
          HttpStatus.BAD_REQUEST
        );
      }
      // Check if all roleId(s) exist
      const roleExists = await this.userRoleMappingRepository.find({
        where: {
          userId: deleteAssignRoleDto.userId,
          roleId: In(deleteAssignRoleDto.roleId),
        },
      });
      // If any roleId(s) are missing, throw an error
      if (roleExists.length !== deleteAssignRoleDto.roleId.length) {
        return APIResponse.error(
          res,
          apiId,
          `Roles not found for the user`,
          "Roles not found",
          HttpStatus.BAD_REQUEST
        );
      }
      // If all validations pass, proceed with deletion
      const response = await this.userRoleMappingRepository.delete({
        userId: deleteAssignRoleDto.userId,
        roleId: In(deleteAssignRoleDto.roleId),
      });
      return APIResponse.success(
        res,
        apiId,
        { rowCount: response.affected },
        HttpStatus.OK,
        "Roles deleted successfully."
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

  //    async checkAndAddUserRole(data){
  //     let existingUser = await this.checkExistingRole(data.userId) ;
  //     if(existingUser){
  //         let update  =
  //     }
  //    }

  async checkExistingRole(userId) {
    const result = await this.userRoleMappingRepository.findOne({
      where: { userId },
    });
    return result;
  }
}
