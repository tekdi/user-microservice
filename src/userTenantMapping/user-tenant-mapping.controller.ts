import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiConsumes,
  ApiHeader,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiConflictResponse,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  UseInterceptors,
  Req,
  UploadedFile,
  Res,
  Headers,
  UseGuards,
  ValidationPipe,
  UsePipes,
  UseFilters,
} from "@nestjs/common";
import { Request } from "@nestjs/common";
import { Response, response } from "express";
import { AssignTenantAdapter } from "./user-tenant-mapping.adapter";
import { UserOrgTenantMappingDto } from "./dto/user-tenant-mapping.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";

@ApiTags("AssignTenant")
@Controller("assign-tenant")
@UseGuards(JwtAuthGuard)
export class AssignTenantController {
  constructor(private readonly assignTenantAdapter: AssignTenantAdapter) {}

  @UseFilters(new AllExceptionsFilter(APIID.ASSIGN_TENANT_CREATE))
  @Post()
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Tenant assigned successfully to the user.",
  })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiConflictResponse({
    description: "Tenant is already assigned to this user.",
  })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: UserOrgTenantMappingDto })
  public async createUserTenantMapping(
    @Headers() headers,
    @Req() request: Request,
    @Body() userTenantMappingDto: UserOrgTenantMappingDto,
    @Res() response: Response
  ) {
    return await this.assignTenantAdapter
      .buildAssignTenantAdapter()
      .userTenantMapping(request, userTenantMappingDto, response);
  }
}
