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
// Service will be added when available
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
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";

@ApiTags("rbac")
@Controller("assignprivilege")
@UseGuards(JwtAuthGuard)
export class AssignPrivilegeController {
  constructor() {} // Service will be added when available

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
    // TODO: Implement service method
    throw new Error("Service not yet implemented");
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
    // TODO: Implement service method
    throw new Error("Service not yet implemented");
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
