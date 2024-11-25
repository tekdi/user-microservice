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
  Query,
} from "@nestjs/common";
import { AssignPrivilegeAdapter } from "./assign-privilege.apater";
import { CreatePrivilegeRoleDto } from "./dto/create-assign-privilege.dto";
import { Response, Request } from "express";
import {
  ApiBasicAuth,
  ApiCreatedResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";

@ApiTags("rbac")
@Controller("assignprivilege")
@UseGuards(JwtAuthGuard)
export class AssignPrivilegeController {
  constructor(
    private readonly assignPrivilegeAdpater: AssignPrivilegeAdapter
  ) { }

  @Post()
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Privilege has been Assigned successfully.",
  })
  @ApiQuery({ name: "userId", required: false, })
  @ApiBody({ type: CreatePrivilegeRoleDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiHeader({ name: "tenantid" })
  public async create(
    @Req() request: Request,
    @Body() createAssignPrivilegeDto: CreatePrivilegeRoleDto,
    @Res() response: Response,
    @Query("userId") userId: string | null = null
  ) {
    createAssignPrivilegeDto.createdBy = userId;
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
