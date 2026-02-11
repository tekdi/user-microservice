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
  ApiQuery,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from "@nestjs/swagger";
import { InterestService } from "./interest.service";
import { CreateInterestDto } from "./dto/create-interest.dto";
import { UpdateInterestDto } from "./dto/update-interest.dto";
import { ListInterestDto } from "./dto/list-interest.dto";
import { SaveUserInterestsDto } from "./dto/save-user-interests.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { API_RESPONSES } from "@utils/response.messages";
import { isUUID } from "class-validator";

@ApiTags("Interest")
@Controller("interest")
@UseGuards(JwtAuthGuard)
export class InterestController {
  constructor(private readonly interestService: InterestService) { }

  @Post("create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new interest",
    description: "Creates a new interest for a pathway.",
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
    type: CreateInterestDto,
  })
  @ApiResponse({
    status: 201,
    description: "Interest created successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiConflictResponse({ description: "Interest already exists" })
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
    return this.interestService.create(createInterestDto, response);
  }

  @Put("update/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update interest",
    description: "Updates an existing interest.",
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
    description: "Interest UUID",
    type: String,
    format: "uuid",
  })
  @ApiBody({
    type: UpdateInterestDto,
  })
  @ApiResponse({
    status: 200,
    description: "Interest updated successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "Interest not found" })
  @ApiConflictResponse({ description: "Interest key conflict" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
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
    return this.interestService.update(id, updateInterestDto, response);
  }

  @Delete("delete/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete interest (Soft Delete)",
    description: "Soft deletes an interest by setting is_active to false.",
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
    description: "Interest UUID",
    type: String,
    format: "uuid",
  })
  @ApiResponse({
    status: 200,
    description: "Interest deleted successfully",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "Interest not found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestService.delete(id, response);
  }

  @Get("list/:pathwayId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get Interests by Pathway ID",
    description: "Retrieves interests associated with a specific pathway.",
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
    name: "pathwayId",
    description: "Pathway UUID",
    type: String,
    format: "uuid",
  })
  @ApiResponse({
    status: 200,
    description: "Success Response",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "Pathway not found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
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
    return this.interestService.listByPathwayId(
      pathwayId,
      response,
      listInterestDto
    );
  }

  @Post("pathway/interests")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Save User Interests for a Pathway",
    description: "Saves selected user interests for a specific pathway engagement.",
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
    type: SaveUserInterestsDto,
  })
  @ApiResponse({
    status: 200,
    description: "Success Response",
  })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiNotFoundResponse({ description: "User pathway history record not found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async saveUserInterests(
    @Body() saveUserInterestsDto: SaveUserInterestsDto,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.interestService.saveUserInterests(saveUserInterestsDto, response);
  }
}
