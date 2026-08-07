import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  Req,
  Res,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { AssignPrivilegeAdapter } from "./assign-privilege.apater";
import { CreatePrivilegeRoleDto } from "./dto/create-assign-privilege.dto";
import { UpdateRolePrivilegesDto } from "./dto/update-assign-privilege.dto";
import { Response, Request } from "express";
import {
  ApiBasicAuth,
  ApiCreatedResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";

@ApiTags("rbac")
@Controller("assignprivilege")
@UseGuards(JwtAuthGuard)
export class AssignPrivilegeController {
  constructor(
    private readonly assignPrivilegeAdpater: AssignPrivilegeAdapter
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Privilege has been Assigned successfully.",
  })
  @ApiBody({ type: CreatePrivilegeRoleDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiHeader({ name: "tenantid" })
  public async create(
    @Req() request: Request,
    @Body() createAssignPrivilegeDto: CreatePrivilegeRoleDto,
    @Res() response: Response
  ) {
    return await this.assignPrivilegeAdpater
      .buildPrivilegeRoleAdapter()
      .createPrivilegeRole(request, createAssignPrivilegeDto, response);
  }

  @Get("/:roleid")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Privilege Details." })
  @ApiHeader({ name: "tenantid" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({ strategy: "excludeAll" })
  public async getRole(
    @Param("roleid") roleId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.assignPrivilegeAdpater
      .buildPrivilegeRoleAdapter()
      .getPrivilegeRole(roleId, request, response);
  }

  @Patch("/:roleid")
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiBody({ type: UpdateRolePrivilegesDto })
  @ApiOkResponse({ description: "Role privileges updated successfully." })
  public async updatePrivileges(
    @Param("roleid") roleId: string,
    @Body() updateRolePrivilegesDto: UpdateRolePrivilegesDto,
    @Res() response: Response
  ) {
    return await this.assignPrivilegeAdpater
      .buildPrivilegeRoleAdapter()
      .updateRolePrivileges(roleId, updateRolePrivilegesDto, response);
  }

  @Delete("/:roleid/:privilegeId")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Privilege removed from role successfully." })
  public async removePrivilegeFromRole(
    @Param("roleid") roleId: string,
    @Param("privilegeId") privilegeId: string,
    @Res() response: Response
  ) {
    return await this.assignPrivilegeAdpater
      .buildPrivilegeRoleAdapter()
      .deletePrivilegeFromRole(roleId, privilegeId, response);
  }

  @Get("/:roleid/grouped")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({
    description:
      "Full permission registry grouped by module/submodule with assigned flags for this role.",
  })
  public async getGroupedPermissions(
    @Param("roleid") roleId: string,
    @Res() response: Response
  ) {
    return await this.assignPrivilegeAdpater
      .buildPrivilegeRoleAdapter()
      .getGroupedPermissionsForRole(roleId, response);
  }

  // @Delete("/:id")
  // @ApiBasicAuth("access-token")
  // @ApiCreatedResponse({ description: "Assigend Privililege has been deleted successfully." })
  // @ApiForbiddenResponse({ description: "Forbidden" })
  // public async deletePrivilegeRole(
  //   @Param("id") userId: string,
  //   @Res() response: Response
  // ) {
  //   const result = await this.assignPrivilegeAdpater.buildPrivilegeRoleAdapter().deletePrivilegeRole(userId);
  //   return response.status(result.statusCode).json(result);
  // }
}
