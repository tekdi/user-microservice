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
  ApiNotFoundResponse,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
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
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import { Request } from "@nestjs/common";
import { Response, response } from "express";
import { UserTenantMappingService } from "./user-tenant-mapping.service";
import { UserTenantMappingDto, UpdateAssignTenantStatusDto } from "./dto/user-tenant-mapping.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
import { API_RESPONSES } from "src/common/utils/response.messages";

@ApiTags("UserTenant")
@Controller("user-tenant")
@UseGuards(JwtAuthGuard)
export class AssignTenantController {
  constructor(private readonly userTenantMappingService: UserTenantMappingService) {}

  @UseFilters(new AllExceptionsFilter(APIID.ASSIGN_TENANT_CREATE))
  @Post()
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: API_RESPONSES.TENANT_ASSIGNED_SUCCESSFULLY,
  })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiConflictResponse({
    description: API_RESPONSES.CONFLICT_USER_ROLE_IN_TENANT,
  })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: UserTenantMappingDto })
  public async createUserTenantMapping(
    @Headers() headers,
    @Req() request: Request,
    @Body() userTenantMappingDto: UserTenantMappingDto,
    @Res() response: Response
  ) {
    return await this.userTenantMappingService
      .userTenantMapping(request, userTenantMappingDto, response);
  }

  @Get("/:userId")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiParam({
    name: "userId",
    required: true,
    type: String,
    format: "uuid",
    description: "User ID (UUID format) - Required",
    example: "13946cb5-daee-410e-9174-25f73357f8cb"
  })
  @ApiOkResponse({ description: API_RESPONSES.USER_TENANT_MAPPINGS_RETRIEVED })
  @ApiNotFoundResponse({ description: "No mappings found" })
  @ApiQuery({ 
    name: "includeArchived", 
    required: false, 
    type: Boolean,
    description: "Include archived mappings" 
  })
  public async getUserTenantMappings(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query("includeArchived") includeArchived: string,
    @Res() response: Response
  ) {
    return await this.userTenantMappingService
      .getUserTenantMappings(userId, includeArchived === "true", response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.ASSIGN_TENANT_UPDATE_STATUS))
  @Patch("/status")
  @ApiBasicAuth("access-token")
  @ApiQuery({
    name: "userId",
    required: true,
    type: String,
    description: "User ID (UUID format) - Required",
    example: "13946cb5-daee-410e-9174-25f73357f8cb"
  })
  @ApiQuery({
    name: "tenantId",
    required: true,
    type: String,
    description: "Tenant ID (UUID format) - Required",
    example: "914ca990-9b45-4385-a06b-05054f35d0b9"
  })
  @ApiOkResponse({
    description: API_RESPONSES.USER_TENANT_MAPPING_STATUS_UPDATED,
  })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiNotFoundResponse({ description: "User-Tenant mapping not found." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: UpdateAssignTenantStatusDto })
  public async updateAssignTenantStatus(
    @Headers() headers,
    @Req() request: Request,
    @Query("userId", ParseUUIDPipe) userId: string,
    @Query("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() updateStatusDto: UpdateAssignTenantStatusDto,
    @Res() response: Response
  ) {
    return await this.userTenantMappingService
      .updateAssignTenantStatus(request, userId, tenantId, updateStatusDto, response);
  }
}
