import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Query,
  Body,
  Param,
  Headers,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpStatus,
  HttpCode,
  BadRequestException,
  ParseUUIDPipe,
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
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from "@nestjs/swagger";
import { InterestsService } from "./interests.service";
import { CreateInterestDto } from "./dto/create-interest.dto";
import { UpdateInterestDto } from "./dto/update-interest.dto";
import { ListInterestDto } from "./dto/list-interest.dto";
import { SaveUserInterestsDto } from "./dto/save-user-interests.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { API_RESPONSES } from "@utils/response.messages";
import { isUUID } from "class-validator";

@ApiTags("Interests")
@Controller("interest")
@UseGuards(JwtAuthGuard)
export class InterestsController {
  constructor(private readonly interestsService: InterestsService) { }

  /**
   * Create a new interest
   */
  @Post("create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new interest",
    description: "Creates a new interest for a specific pathway.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({ type: CreateInterestDto })
  @ApiResponse({ status: 201, description: "Interest created successfully" })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiConflictResponse({ description: "Interest with this key already exists" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createInterestDto: CreateInterestDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.create(createInterestDto, response);
  }

  /**
   * Update an existing interest
   */
  @Put("update/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update interest",
    description: "Partially updates an existing interest's details.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiParam({ name: "id", description: "Interest UUID", format: "uuid" })
  @ApiBody({ type: UpdateInterestDto })
  @ApiResponse({ status: 200, description: "Interest updated successfully" })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiNotFoundResponse({ description: "Interest not found" })
  @ApiConflictResponse({ description: "Conflict - Key already exists" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateInterestDto: UpdateInterestDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.update(id, updateInterestDto, response);
  }

  /**
   * Soft delete an interest
   */
  @Delete("delete/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete interest",
    description: "Performs a soft delete by setting the interest as inactive.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiParam({ name: "id", description: "Interest UUID", format: "uuid" })
  @ApiResponse({ status: 200, description: "Interest deleted successfully" })
  @ApiNotFoundResponse({ description: "Interest not found" })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.delete(id, response);
  }

  /**
   * List all interests for a pathway with pagination
   */
  @Get("list/:pathwayId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List Interests by Pathway",
    description: "Retrieves interests associated with the given pathway ID with pagination support. Returns paginated results with count metadata.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiParam({ name: "pathwayId", description: "Pathway UUID", format: "uuid" })
  @ApiResponse({
    status: 200,
    description: "Interests retrieved successfully",
    schema: {
      example: {
        id: "api.interest.list.pathway",
        ver: "1.0",
        ts: "2026-02-11T10:55:13.663Z",
        params: {
          resmsgid: "uuid",
          status: "successful"
        },
        responseCode: 200,
        result: {
          count: 5,
          totalCount: 15,
          limit: 10,
          offset: 0,
          items: [
            {
              id: "uuid",
              key: "internships",
              label: "Internships",
              is_active: true,
              created_at: "2026-02-11T10:55:13.663Z"
            }
          ]
        }
      }
    }
  })
  @ApiNotFoundResponse({ description: "Pathway not found" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listByPathway(
    @Param("pathwayId", ParseUUIDPipe) pathwayId: string,
    @Query() listInterestDto: ListInterestDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.listByPathwayId(
      pathwayId,
      response,
      listInterestDto
    );
  }

  /**
   * Save user interests for a pathway
   */
  @Post("pathway/saveuserinterests")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Save User Interests for a Pathway",
    description: "Saves a selection of interests for a specific user pathway event.",
  })
  @ApiHeader({ name: "Authorization", required: true })
  @ApiHeader({ name: "tenantid", required: true })
  @ApiBody({ type: SaveUserInterestsDto })
  @ApiResponse({
    status: 200,
    description: "User interests saved successfully",
    schema: {
      example: {
        id: "api.user.pathway.interests.save",
        ver: "1.0",
        ts: "2024-02-08T14:00:00+05:30",
        params: {
          resmsgid: "d712bc19-8e32-4f6b-a91c-7f7d1a91e121",
          status: "success",
        },
        responseCode: "OK",
        result: {
          userPathwayHistoryId: "uph1-uuid",
          savedInterestsCount: 2
        }
      }
    }
  })
  @ApiBadRequestResponse({ description: "Bad Request - Invalid IDs" })
  @ApiNotFoundResponse({ description: "History record not found" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async saveUserInterests(
    @Body() saveUserInterestsDto: SaveUserInterestsDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestsService.saveUserInterests(saveUserInterestsDto, response);
  }
}
