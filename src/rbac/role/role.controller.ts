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
import { CreateRolesDto, RoleDto } from "./dto/role.dto";
import { Request } from "express";
import { RoleSearchDto } from "./dto/role-search.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { RoleService } from "./role.service";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
@ApiTags("rbac")
@Controller("rbac/roles")
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

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
    return await this.roleService
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
    return await this.roleService
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
    return await this.roleService
      .updateRole(roleId, request, roleDto, response);
  }

  // search Role
  @UseFilters(new AllExceptionsFilter(APIID.ROLE_SEARCH))
  @Post("list/roles")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Role List." })
  @ApiBody({ type: RoleSearchDto })
  @ApiForbiddenResponse({ description: "Forbidden" })
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
    return await this.roleService
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
    return await this.roleService
      .deleteRole(roleId, response);
  }
}
