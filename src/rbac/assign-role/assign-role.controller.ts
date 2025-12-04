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
  Headers,
  UseGuards,
  UseFilters,
} from "@nestjs/common";
import { AssignRoleService } from "./assign-role.service";
import { CreateAssignRoleDto } from "./dto/create-assign-role.dto";
import { Response, Request } from "express";
import {
  ApiBasicAuth,
  ApiCreatedResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { DeleteAssignRoleDto } from "./dto/delete-assign-role.dto";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";

@ApiTags("rbac")
@Controller("rbac/usersRoles")
@UseGuards(JwtAuthGuard)
export class AssignRoleController {
  constructor(private readonly assignRoleService: AssignRoleService) {}

  @UseFilters(new AllExceptionsFilter(APIID.USERROLE_CREATE))
  @Post()
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description:
      "Role assigned successfully to the user in the specified tenant.",
  })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiConflictResponse({
    description: "Role is already assigned to this user.",
  })
  @ApiBody({ type: CreateAssignRoleDto })
  // @ApiHeader({ name: "tenantid" })
  public async create(
    @Req() request: Request,
    @Body() createAssignRoleDto: CreateAssignRoleDto,
    @Res() response: Response,
    @Headers() headers
  ) {
    return await this.assignRoleService.createAssignRole(
      request,
      createAssignRoleDto,
      response
    );
    // return response.status(result.statusCode).json(result);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USERROLE_GET))
  @Get("/:userId")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Role Detail." })
  @ApiHeader({ name: "tenantid" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({ strategy: "excludeAll" })
  public async getRole(
    @Param("userId") userId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.assignRoleService.getAssignedRole(
      userId,
      request,
      response
    );
    // return response.status(result.statusCode).json(result);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USERROLE_DELETE))
  @Delete("/:userId")
  @ApiBasicAuth("access-token")
  @ApiHeader({ name: "tenantid" })
  @ApiOkResponse({ description: "Role deleted successfully." })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  public async deleteRole(
    @Body() deleteAssignRoleDto: DeleteAssignRoleDto, // Modify this line to accept DeleteAssignRoleDto
    @Res() response: Response
  ) {
    return await this.assignRoleService.deleteAssignedRole(
      deleteAssignRoleDto,
      response
    );
    // return response.status(result.statusCode).json(result);
  }
}
