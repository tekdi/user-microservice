import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes, ValidationPipe, UseFilters, Res, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { CreateReferralEntityDto } from './dto/create-referral-entity.dto';
import { ImportReferralsDto } from './dto/import-referrals.dto';
import { UpdateReferralSlugDto } from './dto/update-referral-slug.dto';
import { ListReferralsDto } from './dto/list-referrals.dto';
import { ReferralReportRequestDto } from './dto/referral-report.dto';
import { ReferralsService } from './referrals.service';
import APIResponse from '../common/responses/response';
import { APIID } from '../common/utils/api-id.config';
import { API_RESPONSES } from '../common/utils/response.messages';
import { AllExceptionsFilter } from '../common/filters/exception.filter';
import { JwtAuthGuard } from '../common/guards/keycloak.guard';

interface RequestWithUser extends Request {
  user?: { userId: string; name?: string; username?: string; [key: string]: any };
}

@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_CREATE))
  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: CreateReferralEntityDto })
  async create(@Body() dto: CreateReferralEntityDto, @Req() request: RequestWithUser, @Res() response: Response) {
    const createdBy = request.user?.userId ?? null;
    const result = await this.referralsService.createReferralEntity(dto, createdBy);
    return APIResponse.success(
      response,
      APIID.REFERRAL_CREATE,
      result,
      HttpStatus.CREATED,
      API_RESPONSES.REFERRAL_CREATED_SUCCESSFULLY
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_LIST))
  @Post('list')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: ListReferralsDto })
  @ApiOkResponse({ description: 'List referral entities with pagination and filters' })
  async list(@Body() dto: ListReferralsDto, @Res() response: Response) {
    const result = await this.referralsService.listReferralEntities(dto);
    return APIResponse.success(
      response,
      APIID.REFERRAL_LIST,
      result,
      HttpStatus.OK,
      API_RESPONSES.REFERRAL_LIST_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_RESOLVE))
  @Get('resolve')
  async resolve(@Query('slug') slug: string, @Res() response: Response) {
    const result = await this.referralsService.resolveSlug(slug);
    return APIResponse.success(
      response,
      APIID.REFERRAL_RESOLVE,
      result,
      HttpStatus.OK,
      API_RESPONSES.REFERRAL_RESOLVED_SUCCESSFULLY
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_UPDATE))
  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: UpdateReferralSlugDto })
  async updateSlug(
    @Param('id') id: string,
    @Body() dto: UpdateReferralSlugDto,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ) {
    const changedBy = request.user?.userId ?? null;
    const result = await this.referralsService.updateSlug(id, dto, changedBy);
    return APIResponse.success(
      response,
      APIID.REFERRAL_UPDATE,
      result,
      HttpStatus.OK,
      API_RESPONSES.REFERRAL_UPDATED_SUCCESSFULLY
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_IMPORT))
  @Post('import')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: ImportReferralsDto })
  async import(@Body() dto: ImportReferralsDto, @Req() request: RequestWithUser, @Res() response: Response) {
    const createdBy = request.user?.userId ?? null;
    const result = await this.referralsService.importFromCsv(dto, createdBy);
    return APIResponse.success(
      response,
      APIID.REFERRAL_IMPORT,
      result,
      HttpStatus.CREATED,
      API_RESPONSES.REFERRAL_IMPORT_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_BULK))
  @Post('bulk')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: [CreateReferralEntityDto] })
  async bulkInsert(@Body() dtos: CreateReferralEntityDto[], @Req() request: RequestWithUser, @Res() response: Response) {
    const createdBy = request.user?.userId ?? null;
    const result = await this.referralsService.bulkInsert(dtos, createdBy);
    return APIResponse.success(
      response,
      APIID.REFERRAL_BULK,
      result,
      HttpStatus.CREATED,
      API_RESPONSES.REFERRAL_BULK_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFERRAL_REPORT))
  @Post('report')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: ReferralReportRequestDto })
  @ApiOkResponse({ description: 'Referral tracking report with per-slug user counts aggregated by status, cohort and tag' })
  async getReport(@Body() dto: ReferralReportRequestDto, @Res() response: Response) {
    const result = await this.referralsService.getReferralReport(dto);
    return APIResponse.success(
      response,
      APIID.REFERRAL_REPORT,
      result,
      HttpStatus.OK,
      API_RESPONSES.REFERRAL_REPORT_SUCCESS
    );
  }
}

