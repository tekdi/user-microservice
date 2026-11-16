import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  ApiForbiddenResponse,
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
import { ConnectAdminService } from "./connect-admin.service";
import { SafetyReportService } from "./safety-report.service";
import { ConnectAdminGuard } from "./guards/connect-admin.guard";
import {
  ListMasterQueryDto,
  SaveCareerDomainGroupsDto,
  SaveCareerDomainsDto,
  SaveSupportOfferingsDto,
  UpdateCareerDomainDto,
  UpdateCareerDomainGroupDto,
  UpdateSupportOfferingDto,
} from "./dto/admin-master.dto";
import {
  SafetyReportListDto,
  UpdateSafetyReportDto,
} from "./dto/safety-report-admin.dto";
import { CONNECT_ERRORS } from "./constants/connect.constants";

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    name?: string;
    username?: string;
    [key: string]: any;
  };
}

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/** Every route: valid token + admin role in the tenantid tenant (else 403) */
@ApiTags("Connect Admin")
@Controller("connect/admin")
@UseGuards(JwtAuthGuard, ConnectAdminGuard)
@ApiBasicAuth("access-token")
@ApiHeader({ name: "tenantid", required: true })
@ApiForbiddenResponse({ description: CONNECT_ERRORS.ADMIN_ONLY.message })
export class ConnectAdminController {
  constructor(
    private readonly connectAdminService: ConnectAdminService,
    private readonly safetyReportService: SafetyReportService
  ) {}

  // B4. Career domain groups
  @Get("career-domain-groups")
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_LIST)
  )
  @UsePipes(validation)
  @ApiOperation({ summary: "List career domain groups (with domain count)" })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUPS_LIST_SUCCESS,
  })
  async listCareerDomainGroups(
    @Query() query: ListMasterQueryDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.listCareerDomainGroups(query, response);
  }

  @Post("career-domain-groups")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_SAVE)
  )
  @UsePipes(validation)
  @ApiOperation({
    summary: "Add or update many career domain groups (matched by key)",
  })
  @ApiBody({ type: SaveCareerDomainGroupsDto })
  @ApiResponse({
    status: 201,
    description: API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUPS_SAVED,
  })
  async saveCareerDomainGroups(
    @Req() request: RequestWithUser,
    @Body() dto: SaveCareerDomainGroupsDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.saveCareerDomainGroups(
      this.getUserId(request),
      dto,
      response
    );
  }

  @Patch("career-domain-groups/:id")
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_UPDATE)
  )
  @UsePipes(validation)
  @ApiOperation({
    summary: "Rename / reorder / hide one career domain group",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateCareerDomainGroupDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUP_UPDATED,
  })
  async updateCareerDomainGroup(
    @Req() request: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCareerDomainGroupDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.updateCareerDomainGroup(
      this.getUserId(request),
      id,
      dto,
      response
    );
  }

  // B5. Career domains
  @Get("career-domains")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_LIST))
  @UsePipes(validation)
  @ApiOperation({ summary: "List career domains (active and inactive)" })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_CAREER_DOMAINS_LIST_SUCCESS,
  })
  async listCareerDomains(
    @Query() query: ListMasterQueryDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.listCareerDomains(query, response);
  }

  @Post("career-domains")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_SAVE))
  @UsePipes(validation)
  @ApiOperation({
    summary: "Add or update many career domains (matched by key)",
    description:
      "New keys are added, existing keys are updated with the fields sent.",
  })
  @ApiBody({ type: SaveCareerDomainsDto })
  @ApiResponse({
    status: 201,
    description: API_RESPONSES.CONNECT_CAREER_DOMAINS_SAVED,
  })
  async saveCareerDomains(
    @Req() request: RequestWithUser,
    @Body() dto: SaveCareerDomainsDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.saveCareerDomains(
      this.getUserId(request),
      dto,
      response
    );
  }

  @Patch("career-domains/:id")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ADMIN_CAREER_DOMAIN_UPDATE))
  @UsePipes(validation)
  @ApiOperation({
    summary: "Update one career domain (isActive=false hides it)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateCareerDomainDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_CAREER_DOMAIN_UPDATED,
  })
  async updateCareerDomain(
    @Req() request: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCareerDomainDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.updateCareerDomain(
      this.getUserId(request),
      id,
      dto,
      response
    );
  }

  // B6. Support offerings ("Open to" options, support_offering_types)
  @Get("support-offerings")
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_SUPPORT_OFFERING_LIST)
  )
  @UsePipes(validation)
  @ApiOperation({ summary: "List “Open to” options (active and inactive)" })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_SUPPORT_OFFERINGS_LIST_SUCCESS,
  })
  async listSupportOfferings(
    @Query() query: ListMasterQueryDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.listSupportOfferings(query, response);
  }

  @Post("support-offerings")
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_SUPPORT_OFFERING_SAVE)
  )
  @UsePipes(validation)
  @ApiOperation({
    summary: "Add or update many “Open to” options (matched by key)",
    description:
      "New keys are added, existing keys are updated with the fields sent.",
  })
  @ApiBody({ type: SaveSupportOfferingsDto })
  @ApiResponse({
    status: 201,
    description: API_RESPONSES.CONNECT_SUPPORT_OFFERINGS_SAVED,
  })
  async saveSupportOfferings(
    @Req() request: RequestWithUser,
    @Body() dto: SaveSupportOfferingsDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.saveSupportOfferings(
      this.getUserId(request),
      dto,
      response
    );
  }

  @Patch("support-offerings/:id")
  @UseFilters(
    new AllExceptionsFilter(APIID.CONNECT_ADMIN_SUPPORT_OFFERING_UPDATE)
  )
  @UsePipes(validation)
  @ApiOperation({
    summary: "Update one “Open to” option (isActive=false hides it)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateSupportOfferingDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_SUPPORT_OFFERING_UPDATED,
  })
  async updateSupportOffering(
    @Req() request: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportOfferingDto,
    @Res() response: Response
  ) {
    return this.connectAdminService.updateSupportOffering(
      this.getUserId(request),
      id,
      dto,
      response
    );
  }

  // B7. Safety reports (status is changed only here)
  @Post("safety-reports/list")
  @HttpCode(HttpStatus.OK)
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ADMIN_SAFETY_REPORT_LIST))
  @UsePipes(validation)
  @ApiOperation({ summary: "List safety reports (filters + paging)" })
  @ApiBody({ type: SafetyReportListDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_SAFETY_REPORTS_LIST_SUCCESS,
  })
  async listSafetyReports(
    @Body() dto: SafetyReportListDto,
    @Res() response: Response
  ) {
    return this.safetyReportService.listReports(dto, response);
  }

  @Patch("safety-reports/:id")
  @UseFilters(new AllExceptionsFilter(APIID.CONNECT_ADMIN_SAFETY_REPORT_UPDATE))
  @UsePipes(validation)
  @ApiOperation({
    summary: "Review a safety report (ACTION_TAKEN or DISMISSED)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateSafetyReportDto })
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.CONNECT_SAFETY_REPORT_UPDATED,
  })
  async reviewSafetyReport(
    @Req() request: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSafetyReportDto,
    @Res() response: Response
  ) {
    return this.safetyReportService.reviewReport(
      this.getUserId(request),
      id,
      dto,
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
}
