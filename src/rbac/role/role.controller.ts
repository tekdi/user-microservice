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
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { Request } from "@nestjs/common";
import { CreateRolesDto, RoleDto } from "./dto/role.dto";
import { RoleSearchDto } from "./dto/role-search.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { RoleAdapter } from "./roleadapter";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
@ApiTags("rbac")
@Controller("rbac/roles")
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleAdapter: RoleAdapter) {}

  //Get role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_GET))
  @Get("read/:id")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Role Detail." })
  @ApiHeader({ name: "tenantid" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({ strategy: "excludeAll" })
  public async getRole(
    @Param("id", ParseUUIDPipe) roleId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.roleAdapter
      .buildRbacAdapter()
      .getRole(roleId, request, response);
  }

  //Create role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_CREATE))
  @Post("/create")
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Role has been created successfully." })
  @ApiBody({ type: CreateRolesDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiHeader({ name: "tenantid" })
  public async createRole(
    @Req() request: Request,
    @Body() createRolesDto: CreateRolesDto,
    @Res() response: Response
  ) {
    return await this.roleAdapter
      .buildRbacAdapter()
      .createRole(request, createRolesDto, response);
  }

  //Update Role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_UPDATE))
  @Put("update/:id")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Role updated successfully." })
  @ApiBody({ type: RoleDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiHeader({ name: "tenantid" })
  public async updateRole(
    @Param("id") roleId: string,
    @Req() request: Request,
    @Body() roleDto: RoleDto,
    @Res() response: Response
  ) {
    return await this.roleAdapter
      .buildRbacAdapter()
      .updateRole(roleId, request, roleDto, response);
  }

  // search Role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_SEARCH))
  @Post("list/roles")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Role List." })
  @ApiBody({ type: RoleSearchDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  // @UsePipes(ValidationPipe)
  @SerializeOptions({ strategy: "excludeAll" })
  @ApiHeader({ name: "tenantid" })
  public async searchRole(
    @Headers() headers,
    @Req() request: Request,
    @Body() roleSearchDto: RoleSearchDto,
    @Res() response: Response
  ) {
    // let tenantid = headers["tenantid"];
    return await this.roleAdapter
      .buildRbacAdapter()
      .searchRole(roleSearchDto, response);
  }

  //delete role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_DELETE))
  @Delete("delete/:roleId")
  @ApiBasicAuth("access-token")
  @ApiHeader({ name: "tenantid" })
  @ApiOkResponse({ description: "Role deleted successfully." })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  public async deleteRole(
    @Param("roleId") roleId: string,
    @Res() response: Response
  ) {
    return await this.roleAdapter
      .buildRbacAdapter()
      .deleteRole(roleId, response);
  }
}
