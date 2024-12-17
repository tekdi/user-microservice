import { CreatePrivilegesDto, PrivilegeDto } from "./dto/privilege.dto";
import { UpdatePrivilegeDto } from "./dto/update-privilege.dto";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  SerializeOptions,
  Req,
  UsePipes,
  ValidationPipe,
  Res,
  Headers,
  Delete,
  UseGuards,
  Query,
  UseFilters,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { Request } from "@nestjs/common";
import { Response, response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { PrivilegeAdapter } from "./privilegeadapter";
import { v4 as uuidv4 } from "uuid";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";

@UseGuards(JwtAuthGuard)
@ApiTags("rbac")
@Controller("rbac/privileges")
export class PrivilegeController {
  constructor(private readonly privilegeAdapter: PrivilegeAdapter) {}

  @UseFilters(new AllExceptionsFilter(APIID.PRIVILEGE_BYROLEID))
  @Get()
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Privilege Detail." })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @SerializeOptions({ strategy: "excludeAll" })
  public async getPrivilegebyRoleId(
    @Query("tenantId") tenantId: string,
    @Query("roleId") roleId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.privilegeAdapter
      .buildPrivilegeAdapter()
      .getPrivilegebyRoleId(tenantId, roleId, request, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.PRIVILEGE_BYPRIVILEGEID))
  @Get("/:privilegeId")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Privilege Detail." })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @ApiHeader({ name: "tenantid" })
  @SerializeOptions({ strategy: "excludeAll" })
  public async getPrivilege(
    @Param("privilegeId") privilegeId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.privilegeAdapter
      .buildPrivilegeAdapter()
      .getPrivilege(privilegeId, request, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.PRIVILEGE_CREATE))
  @Post("/create")
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Privilege has been created successfully.",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @ApiConflictResponse({ description: "Privilege Already Exists" })
  @ApiBody({ type: CreatePrivilegesDto })
  @ApiHeader({ name: "tenantid" })
  public async createPrivilege(
    @Req() request,
    @Body() createPrivilegesDto: CreatePrivilegesDto,
    @Res() response: Response
  ) {
    return await this.privilegeAdapter
      .buildPrivilegeAdapter()
      .createPrivilege(request.user.userId, createPrivilegesDto, response);
  }

  // @Put("/:id")
  // @ApiBasicAuth("access-token")
  // @ApiOkResponse({ description: "Role updated successfully." })
  // @ApiBadRequestResponse({ description: "Bad Request" })
  // @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  // @ApiConflictResponse({ description: "Privilege Already Exists" })
  // @ApiBody({ type:PrivilegeDto })
  // @ApiForbiddenResponse({ description: "Forbidden" })
  // @ApiHeader({ name: "tenantid", })
  // public async updatePrivilege(
  //   @Param("id") privilegeId: string,
  //   @Req() request: Request,
  //   @Body() privilegeDto: PrivilegeDto,
  //   @Res() response: Response
  // ) {
  //   const result = await this.privilegeAdapter.buildPrivilegeAdapter().updatePrivilege(privilegeId, request, privilegeDto);
  //   return response.status(result.statusCode).json(result);
  // }

  // @Get()
  // @ApiBasicAuth("access-token")
  // @ApiOkResponse({ description: "Privilege Detail." })
  // @ApiHeader({ name: "tenantid" })
  // @ApiOkResponse({ description: "Privileges List" })
  // @ApiBadRequestResponse({ description: "Bad Request" })
  // @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  // @SerializeOptions({strategy: "excludeAll",})
  // public async getAllPrivilege(
  //   @Req() request: Request,
  //   @Res() response: Response
  // ) {
  //   const result = await this.privilegeAdapter.buildPrivilegeAdapter().getAllPrivilege(request);
  //   return response.status(result.statusCode).json(result);
  // }

  @UseFilters(new AllExceptionsFilter(APIID.PRIVILEGE_DELETE))
  @Delete("/:privilegeId")
  @ApiBasicAuth("access-token")
  @ApiHeader({ name: "tenantid" })
  @ApiOkResponse({ description: "Role deleted successfully." })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  public async deleteRole(
    @Param("privilegeId", ParseUUIDPipe) privilegeId: string,
    @Res() response: Response
  ) {
    return await this.privilegeAdapter
      .buildPrivilegeAdapter()
      .deletePrivilege(privilegeId, response);
  }
}
