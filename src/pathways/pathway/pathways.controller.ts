import { ActivePathwayDto } from "./dto/active-pathway.dto";
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Logger,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
  ApiParam,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ApiGetByIdCommon } from "../common/decorators/api-common.decorator";
import { PathwaysService } from "./pathways.service";
import { CreatePathwayDto } from "./dto/create-pathway.dto";
import { UpdatePathwayDto } from "./dto/update-pathway.dto";
import { ListPathwayDto } from "./dto/list-pathway.dto";
import { PathwayPresignedUrlDto } from "./dto/presigned-url.dto";
import { AssignPathwayDto } from "./dto/assign-pathway.dto";
import { BulkUpdateOrderDto } from "./dto/update-pathway-order.dto";
import { Response, Request } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { InterestsService } from "../interests/interests.service";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import APIResponse from "src/common/responses/response";
import { isUUID } from "class-validator";

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    name?: string;
    username?: string;
    [key: string]: any;
  };
}

@ApiTags("Pathways")
@Controller("pathway")
@UseGuards(JwtAuthGuard)
export class PathwaysController {
  private readonly logger = new Logger(PathwaysController.name);

  constructor(
    private readonly pathwaysService: PathwaysService,
    private readonly interestsService: InterestsService
  ) {}

  /**
   * List saved interests for a specific user pathway history record
   */
  @Get("interests/:userPathwayHistoryId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List Saved Interests for User Pathway History",
    description:
      "Retrieves the list of interests previously saved for a specific pathway history record.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiParam({
    name: "userPathwayHistoryId",
    description: "User Pathway History UUID",
    format: "uuid",
  })
  @ApiResponse({ status: 200, description: "Interests retrieved successfully" })
  @ApiNotFoundResponse({ description: "History record not found" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listUserInterests(
    @Param("userPathwayHistoryId", ParseUUIDPipe) userPathwayHistoryId: string,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.listUserInterests(
      userPathwayHistoryId,
      response
    );
  }

  @Get("config")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get pathway storage config (LMS-style)",
    description:
      "Returns upload path, presigned URL expiry, image mime types and size limit. Frontend can use this like LMS /lms-service/v1/config.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiResponse({
    status: 200,
    description: "Pathway config",
    schema: {
      example: {
        config: {
          pathway_upload_path: "pathway-images/pathway/files",
          presigned_url_expires_in: 3600,
          image_mime_type: "image/jpeg, image/jpg, image/png, image/svg+xml",
          image_filesize: 5,
        },
      },
    },
  })
  async getConfig(
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const config = this.pathwaysService.getPathwayConfig();
    return APIResponse.success(
      response,
      APIID.PATHWAY_CONFIG,
      { config },
      HttpStatus.OK,
      "Config retrieved"
    );
  }

  @Post("storage/presigned-url")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get presigned URL for pathway image upload",
    description:
      "Returns a presigned S3 URL. Client uploads the file to this URL, then sends the returned fileUrl as image_url in pathway create/update (JSON body). Key must start with PATHWAY_STORAGE_KEY_PREFIX (e.g. pathway/pathwayId/imagename.png).",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({ type: PathwayPresignedUrlDto })
  @ApiResponse({
    status: 200,
    description:
      "Presigned POST generated (LMS-style: url + fields). POST form-data to url with fields + file.",
    schema: {
      example: {
        url: "https://bucket.s3.region.amazonaws.com/",
        fields: {
          "Content-Type": "image/png",
          key: "pathway/files/Screenshot.png",
          bucket: "aspire-leaders-assets-qa",
          "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
          "X-Amz-Credential": "...",
          "X-Amz-Date": "...",
          Policy: "...",
          "X-Amz-Signature": "...",
        },
        fileUrl:
          "https://bucket.s3.region.amazonaws.com/pathway/files/Screenshot.png",
      },
    },
  })
  @ApiBadRequestResponse({
    description: "Invalid key (must start with configured prefix)",
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getPresignedUrl(
    @Body() dto: PathwayPresignedUrlDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const result = await this.pathwaysService.getPresignedUploadUrl(
      dto.key,
      dto.contentType,
      dto.expiresIn,
      dto.sizeLimit
    );
    return APIResponse.success(
      response,
      APIID.PATHWAY_PRESIGNED_URL,
      result,
      HttpStatus.OK,
      "Presigned URL generated"
    );
  }

  @Delete("storage/files")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete file from pathway S3 storage",
    description:
      "Deletes a file from S3 by URL or key (same idea as LMS DELETE /storage/files?key=...). Use this to remove an image from S3. Key/URL must be under PATHWAY_STORAGE_KEY_PREFIX.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiResponse({
    status: 200,
    description: "File deleted",
    schema: { example: { deleted: true, key: "pathway/files/old.png" } },
  })
  @ApiBadRequestResponse({ description: "Invalid or disallowed key/URL" })
  async deleteStorageFile(
    @Query("key") keyOrUrl: string,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!keyOrUrl || typeof keyOrUrl !== "string" || !keyOrUrl.trim()) {
      throw new BadRequestException(
        "Query parameter 'key' (file URL or S3 key) is required"
      );
    }
    return this.pathwaysService.deletePathwayStorageFile(
      keyOrUrl.trim(),
      response
    );
  }

  @Post("create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new pathway",
    description:
      "Creates a new pathway with the provided information. Key must be unique.",
  })
  @ApiHeader({
    name: "Authorization",
    description: "Bearer token for authentication",
    required: true,
  })
  @ApiHeader({
    name: "tenantid",
    description: "Tenant UUID",
    required: true,
  })
  @ApiBody({
    type: CreatePathwayDto,
    examples: {
      pathway: {
        summary: "Standard pathway creation",
        value: {
          key: "career_dev",
          name: "Career Development",
          description: "Build skills for corporate success and job placements.",
          tags: [
            "a1b2c3d4-e111-2222-3333-444455556666",
            "b2c3d4e5-f111-2222-3333-444455556777",
          ],
          display_order: 1,
          is_active: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Pathway created successfully",
    schema: {
      example: {
        id: "c3b6e50e-40ab-4148-8ca9-3b2296ca11e5",
        key: "career_dev",
        name: "Career Development",
        description: "Build skills for corporate success and job placements.",
        tag_ids: [
          "a1b2c3d4-e111-2222-3333-444455556666",
          "b2c3d4e5-f111-2222-3333-444455556777",
        ],
        display_order: 1,
        is_active: true,
        created_at: "2026-02-10T06:22:26.934Z",
      },
    },
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiConflictResponse({
    description: "Pathway conflict: check if key or active name already exists",
  })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createPathwayDto: CreatePathwayDto,
    @Headers("tenantid") tenantId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const userId = request.user?.userId || null;
    return this.pathwaysService.create(createPathwayDto, userId, response);
  }

  /**
   * Bulk update pathway display orders
   */
  @Post("order/structure")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Bulk Update Pathway Order Structure",
    description:
      "Updates the display order for multiple pathways in a single request.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({ type: BulkUpdateOrderDto })
  @ApiResponse({
    status: 200,
    description: "Pathway order structure updated successfully",
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateOrderStructure(
    @Body() bulkUpdateOrderDto: BulkUpdateOrderDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.updateOrderStructure(
      bulkUpdateOrderDto,
      response
    );
  }

  @Post("list")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List pathways",
    description:
      "Retrieves a list of pathways, optionally filtered by active status.",
  })
  @ApiHeader({
    name: "Authorization",
    description: "Bearer token for authentication",
    required: true,
  })
  @ApiHeader({
    name: "tenantid",
    description: "Tenant UUID",
    required: true,
  })
  @ApiBody({
    type: ListPathwayDto,
    required: false,
    examples: {
      active: {
        summary: "List active pathways",
        value: {
          isActive: true,
        },
      },
      all: {
        summary: "List all pathways",
        value: {},
      },
      paginated: {
        summary: "List pathways with pagination",
        value: {
          isActive: true,
          limit: 10,
          offset: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "List of pathways retrieved successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(
    @Body() listPathwayDto: ListPathwayDto,
    @Headers("tenantid") tenantId: string,
    @Headers("organisationid") organisationId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    // SECURITY FIX: Use environment variable as safer fallback instead of client-provided header
    // This prevents users from accessing other organizations' data by manipulating headers
    // If organisationId is provided in header, validate it (future enhancement: check user access)
    // For now, use DEFAULT_ORGANISATION_ID from environment for consistency with safer patterns
    const orgId = process.env.DEFAULT_ORGANISATION_ID || organisationId || "";
    if (organisationId && organisationId !== orgId) {
      // Log warning if client provided different organisationId than default
      // Future: Add authorization check here to validate user has access to requested organisationId
      this.logger.warn(
        `Client provided organisationId ${organisationId} differs from default ${orgId}. Using default for security.`
      );
    }
    return this.pathwaysService.list(listPathwayDto, tenantId, orgId, response);
  }

  /**
   * Get Active Pathway for User
   */
  @Post("active")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get Active Pathway or specific pathway history for User",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({
    type: ActivePathwayDto,
    description: "User ID (required) and Pathway ID (optional)",
  })
  @ApiResponse({
    status: 200,
    description: "Active pathway retrieved successfully",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        pathwayId: { type: "string" },
        activatedAt: { type: "string" },
        userGoal: { type: "string" },
      },
    },
  })
  @ApiNotFoundResponse({ description: "User or Active Pathway not found" })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getActivePathway(
    @Body() activePathwayDto: ActivePathwayDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.getActivePathway(activePathwayDto, response);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get pathway by ID",
    description: "Retrieves a specific pathway by its UUID.",
  })
  @ApiGetByIdCommon()
  @ApiParam({
    name: "id",
    description: "Pathway UUID",
    type: String,
    format: "uuid",
  })
  @ApiResponse({
    status: 200,
    description: "Pathway retrieved successfully",
  })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.findOne(id, response);
  }

  @Patch("update/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update pathway",
    description: "Partially updates a pathway with the provided fields.",
  })
  @ApiHeader({
    name: "Authorization",
    description: "Bearer token for authentication",
    required: true,
  })
  @ApiHeader({
    name: "tenantid",
    description: "Tenant UUID",
    required: true,
  })
  @ApiParam({
    name: "id",
    description: "Pathway UUID",
    type: String,
    format: "uuid",
  })
  @ApiBody({
    type: UpdatePathwayDto,
    examples: {
      update: {
        summary: "Update pathway name",
        value: {
          name: "Advanced Career Track",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Pathway updated successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request - Invalid UUID format" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "Pathway not found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updatePathwayDto: UpdatePathwayDto,
    @Headers("tenantid") tenantId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const userId = request.user?.userId || null;
    return this.pathwaysService.update(id, updatePathwayDto, userId, response);
  }

  /**
   * Assign / Activate Pathway for User
   */
  @Post("assign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Assign / Activate Pathway for User",
    description:
      "Assigns a pathway to a user. Deactivates any existing active pathway for the user.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({ type: AssignPathwayDto })
  @ApiResponse({ status: 200, description: "Pathway assigned successfully" })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiNotFoundResponse({ description: "User or Pathway not found" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async assign(
    @Body() assignPathwayDto: AssignPathwayDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.assignPathway(assignPathwayDto, response);
  }
}
