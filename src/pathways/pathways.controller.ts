import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
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
import { PathwaysService } from "./pathways.service";
import { CreatePathwayDto } from "./dto/create-pathway.dto";
import { UpdatePathwayDto } from "./dto/update-pathway.dto";
import { ListPathwayDto } from "./dto/list-pathway.dto";
import { AssignPathwayDto } from "./dto/assign-pathway.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { UseGuards, BadRequestException } from "@nestjs/common";
import { API_RESPONSES } from "@utils/response.messages";
import { isUUID } from "class-validator";

@ApiTags("Pathways")
@Controller("pathway")
@UseGuards(JwtAuthGuard)
export class PathwaysController {
  constructor(private readonly pathwaysService: PathwaysService) { }

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
          description: "Build skills for corporate success",
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
        id: "uuid",
        key: "career_dev",
        name: "Career Development",
        is_active: true,
      },
    },
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiConflictResponse({ description: "Pathway with this key already exists" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createPathwayDto: CreatePathwayDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.create(createPathwayDto, response);
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
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.list(listPathwayDto, response);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get pathway by ID",
    description: "Retrieves a specific pathway by its UUID.",
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
  @ApiResponse({
    status: 200,
    description: "Pathway retrieved successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request - Invalid UUID format" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "Pathway not found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
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
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.update(id, updatePathwayDto, response);
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
    @Res() response: Response
  ): Promise<Response> {
    return this.pathwaysService.assignPathway(assignPathwayDto, response);
  }
}
