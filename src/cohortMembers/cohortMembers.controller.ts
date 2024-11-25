import {
  ApiTags,
  ApiBody,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  SerializeOptions,
  Req,
  Headers,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Query,
  UseFilters,
  BadRequestException,
} from "@nestjs/common";
import { CohortMembersSearchDto } from "./dto/cohortMembers-search.dto";
import { Request } from "@nestjs/common";
import { CohortMembersDto } from "./dto/cohortMembers.dto";
import { CohortMembersAdapter } from "./cohortMembersadapter";
import { CohortMembersUpdateDto } from "./dto/cohortMember-update.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { Response } from "express";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
import { BulkCohortMember } from "./dto/bulkMember-create.dto";
import { isUUID } from "class-validator";
import { API_RESPONSES } from "@utils/response.messages";

@ApiTags("Cohort Member")
@Controller("cohortmember")
export class CohortMembersController {
  constructor(private readonly cohortMemberAdapter: CohortMembersAdapter) { }

  //create cohort members
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_CREATE))
  @Post("/create")
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Cohort Member has been created successfully.",
  })
  @ApiBody({ type: CohortMembersDto })
  @ApiHeader({
    name: "tenantid",
  })
  @ApiHeader({
    name: "academicyearid",
  })
  @ApiHeader({
    name: "deviceid",
  })
  @ApiQuery({ name: "userId", required: false, })
  public async createCohortMembers(
    @Headers() headers,
    @Req() request,
    @Body() cohortMembersDto: CohortMembersDto,
    @Res() response: Response,
    @Query("userId") userId: string | null = null
  ) {
    const loginUser = userId;
    const tenantId = headers["tenantid"];
    const deviceId = headers["deviceid"];
    const academicyearId = headers["academicyearid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        "academicyearId is required and academicyearId must be a valid UUID."
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .createCohortMembers(
        loginUser,
        cohortMembersDto,
        response,
        tenantId,
        deviceId,
        academicyearId
      );
    return response.status(result.statusCode).json(result);
  }

  //get cohort members
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_GET))
  @Get("/read/:cohortId")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Cohort Member detail" })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  @SerializeOptions({ strategy: "excludeAll" })
  @ApiHeader({ name: "tenantid" })
  @ApiQuery({
    name: "fieldvalue",
    description: "Send True to Fetch Custom Field of User",
    required: false,
  })
  @ApiHeader({
    name: "academicyearid",
  })
  public async getCohortMembers(
    @Headers() headers,
    @Param("cohortId") cohortId: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query("fieldvalue") fieldvalue: string | null = null
  ) {
    const tenantId = headers["tenantid"];
    const academicyearId = headers["academicyearid"];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        "academicyearId is required and academicyearId must be a valid UUID."
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .getCohortMembers(
        cohortId,
        tenantId,
        fieldvalue,
        academicyearId,
        response
      );
  }

  // search;
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_SEARCH))
  @Post("/list")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Cohort Member list." })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  @ApiBody({ type: CohortMembersSearchDto })
  @UsePipes(new ValidationPipe())
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
  })
  @ApiHeader({
    name: "academicyearid",
  })
  public async searchCohortMembers(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() cohortMembersSearchDto: CohortMembersSearchDto
  ) {
    const tenantId = headers["tenantid"];
    const academicyearId = headers["academicyearid"];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        "academicyearId is required and must be a valid UUID."
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .searchCohortMembers(
        cohortMembersSearchDto,
        tenantId,
        academicyearId,
        response
      );
  }

  //update
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_UPDATE))
  @Put("/update/:cohortmembershipid")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Cohort Member has been updated successfully.",
  })
  @ApiNotFoundResponse({ description: "Data not found" })
  @ApiBadRequestResponse({ description: "Bad request" })
  @ApiBody({ type: CohortMembersUpdateDto })
  @UsePipes(new ValidationPipe())
  @ApiQuery({ name: "userId", required: false, })
  public async updateCohortMembers(
    @Param("cohortmembershipid") cohortMembersId: string,
    @Req() request,
    @Body() cohortMemberUpdateDto: CohortMembersUpdateDto,
    @Res() response: Response,
    @Query("userId") userId: string | null = null
  ) {
    const loginUser = userId;

    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .updateCohortMembers(
        cohortMembersId,
        loginUser,
        cohortMemberUpdateDto,
        response
      );
  }

  //delete
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_DELETE))
  @Delete("/delete/:id")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Cohort member deleted successfully" })
  @ApiNotFoundResponse({ description: "Data not found" })
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
  })
  public async deleteCohortMember(
    @Headers() headers,
    @Param("id") cohortMembershipId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const tenantid = headers["tenantid"];

    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .deleteCohortMemberById(tenantid, cohortMembershipId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_CREATE))
  @Post("/bulkCreate")
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Cohort Member has been created successfully.",
  })
  @ApiBody({ type: BulkCohortMember })
  @ApiHeader({
    name: "tenantid",
  })
  @ApiHeader({
    name: "academicyearid",
  })
  public async craeteBulkCohortMembers(
    @Headers() headers,
    @Req() request,
    @Body() bulkcohortMembersDto: BulkCohortMember,
    @Res() response: Response
  ) {
    const loginUser = request.user.userId;
    const tenantId = headers["tenantid"];
    const academicyearId = headers["academicyearid"];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        "academicyearId is required and must be a valid UUID."
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .createBulkCohortMembers(
        loginUser,
        bulkcohortMembersDto,
        response,
        tenantId,
        academicyearId
      );
    return result;
  }
}
