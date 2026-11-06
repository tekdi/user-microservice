import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBasicAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { isUUID } from "class-validator";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { ConnectService } from "./connect.service";
import { SafetyReportService } from "./safety-report.service";
import { JoinConnectDto } from "./dto/join-connect.dto";
import { UpdateConnectProfileDto } from "./dto/update-connect-profile.dto";
import { ConnectListDto } from "./dto/connect-list.dto";
import { LinkedinClickDto } from "./dto/linkedin-click.dto";
import { CreateConnectReportDto } from "./dto/create-connect-report.dto";

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    name?: string;
    username?: string;
    [key: string]: any;
  };
}

@ApiTags("Connect")
@Controller("connect")
@UseGuards(JwtAuthGuard)
@ApiBasicAuth("access-token")
@ApiHeader({ name: "tenantid", required: true })
export class ConnectController {
  constructor(
    private readonly connectService: ConnectService,
    private readonly safetyReportService: SafetyReportService
  ) {}

  // A1
  @Get("me")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ME))
  @ApiOperation({
    summary: "Membership state, Aspire journey data and own Connect profile",
  })
  @ApiResponse({ status: 200, description: API_RESPONSES.CONNECT_ME_SUCCESS })
  async getMe(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ) {
    return this.connectService.getMe(
      this.getUserId(request),
      this.validTenant(tenantId),
      response
    );
  }

  // A2
  @Get("options")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_OPTIONS))
  @ApiOperation({
    summary:
      "Career domain groups and domains, Open to options, statuses, member countries, report reasons",
  })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_OPTIONS_SUCCESS,
  })
  async getOptions(
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ) {
    return this.connectService.getOptions(this.validTenant(tenantId), response);
  }

  // A3
  @Post("join")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_JOIN))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: "Join Connect (or re-join after leaving)" })
  @ApiBody({ type: JoinConnectDto })
  @ApiResponse({ status: 201, description: API_RESPONSES.CONNECT_JOIN_SUCCESS })
  async join(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Body() dto: JoinConnectDto,
    @Res() response: Response
  ) {
    return this.connectService.join(
      this.getUserId(request),
      this.validTenant(tenantId),
      dto,
      response
    );
  }

  // A4: POST because of the multi-value filters, search, sort, seed and paging
  @Post("list")
  @HttpCode(HttpStatus.OK)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_LIST))
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  @ApiOperation({
    summary: "Your Aspire community: search, filters, sort and pages",
  })
  @ApiBody({ type: ConnectListDto })
  @ApiResponse({ status: 200, description: API_RESPONSES.CONNECT_LIST_SUCCESS })
  async list(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Body() dto: ConnectListDto,
    @Res() response: Response
  ) {
    return this.connectService.list(
      this.getUserId(request),
      this.validTenant(tenantId),
      dto,
      response
    );
  }

  // A5
  @Get("profile/:userId")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_PROFILE_READ))
  @ApiOperation({ summary: "One member's full Connect profile" })
  @ApiParam({ name: "userId", format: "uuid" })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_PROFILE_SUCCESS,
  })
  async getProfile(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
    @Res() response: Response
  ) {
    return this.connectService.getProfile(
      this.getUserId(request),
      this.validTenant(tenantId),
      targetUserId,
      response
    );
  }

  // A6
  @Post("profile/:userId/linkedin-click")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_LINKEDIN_CLICK))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: "Track a 'Say hello on LinkedIn' click" })
  @ApiParam({ name: "userId", format: "uuid" })
  @ApiBody({ type: LinkedinClickDto })
  @ApiResponse({
    status: 201,
    description: API_RESPONSES.CONNECT_LINKEDIN_CLICK_SUCCESS,
  })
  async trackLinkedinClick(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
    @Body() dto: LinkedinClickDto,
    @Res() response: Response
  ) {
    return this.connectService.trackLinkedinClick(
      this.getUserId(request),
      this.validTenant(tenantId),
      targetUserId,
      dto,
      response
    );
  }

  // A7
  @Post("reports")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_REPORT_CREATE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: "Report a member, or report a general safety concern",
  })
  @ApiBody({ type: CreateConnectReportDto })
  @ApiResponse({
    status: 201,
    description: API_RESPONSES.CONNECT_REPORT_CREATED,
  })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_REPORT_ALREADY_OPEN,
  })
  async createReport(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Body() dto: CreateConnectReportDto,
    @Res() response: Response
  ) {
    return this.safetyReportService.createReport(
      this.getUserId(request),
      this.validTenant(tenantId),
      dto,
      response
    );
  }

  // A8
  @Patch("me")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_PROFILE_UPDATE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: "Edit my community profile (only changed fields)" })
  @ApiBody({ type: UpdateConnectProfileDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_PROFILE_UPDATED,
  })
  async updateMe(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Body() dto: UpdateConnectProfileDto,
    @Res() response: Response
  ) {
    return this.connectService.updateMe(
      this.getUserId(request),
      this.validTenant(tenantId),
      dto,
      response
    );
  }

  // A9
  @Patch("me/leave")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_LEAVE))
  @ApiOperation({
    summary: "Leave Connect (profile kept, hidden from members)",
  })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_LEAVE_SUCCESS,
  })
  async leave(
    @Req() request: RequestWithUser,
    @Headers("tenantid") tenantId: string,
    @Res() response: Response
  ) {
    return this.connectService.leave(
      this.getUserId(request),
      this.validTenant(tenantId),
      response
    );
  }

  private getUserId(request: RequestWithUser): string {
    const userId = request.user?.userId;
    if (!userId || !isUUID(userId)) {
      throw new BadRequestException(API_RESPONSES.UNAUTHORIZED);
    }
    return userId;
  }

  private validTenant(tenantId: string): string {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return tenantId;
  }
}
