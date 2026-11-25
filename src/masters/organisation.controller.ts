import {
  Body,
  Controller,
  Headers,
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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBasicAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import APIResponse from 'src/common/responses/response';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import {
  CreateOrganisationDto,
  OrganisationListDto,
  UpdateOrganisationDto,
} from './dto/masters.dto';
import { OrganisationService } from './organisation.service';
import { actorOf, requireTenant } from './masters.util';

export const MASTERS_VALIDATION = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('Masters - Org Management')
@Controller('masters/organisation')
@UseGuards(JwtAuthGuard)
@ApiBasicAuth('access-token')
@ApiHeader({ name: 'tenantid', required: true })
export class OrganisationController {
  constructor(private readonly organisationService: OrganisationService) {}

  @UseFilters(new AllExceptionsFilter(APIID.ORGANISATION_LIST))
  @Post('list')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: OrganisationListDto })
  @ApiOkResponse({ description: 'Organisations with user counts.' })
  async list(
    @Headers('tenantid') tenantId: string,
    @Body() dto: OrganisationListDto,
    @Res() response: Response
  ) {
    const result = await this.organisationService.list(requireTenant(tenantId), dto);
    return APIResponse.success(
      response,
      APIID.ORGANISATION_LIST,
      result,
      HttpStatus.OK,
      API_RESPONSES.ORGANISATION_LIST_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.ORGANISATION_CREATE))
  @Post('create')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: CreateOrganisationDto })
  @ApiCreatedResponse({ description: 'Organisation created.' })
  @ApiConflictResponse({ description: 'Code or name already exists.' })
  async create(
    @Headers('tenantid') tenantId: string,
    @Req() request: any,
    @Body() dto: CreateOrganisationDto,
    @Res() response: Response
  ) {
    const result = await this.organisationService.create(
      requireTenant(tenantId),
      actorOf(request),
      dto
    );
    return APIResponse.success(
      response,
      APIID.ORGANISATION_CREATE,
      result,
      HttpStatus.CREATED,
      API_RESPONSES.ORGANISATION_CREATE_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.ORGANISATION_UPDATE))
  @Patch('update/:id')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: UpdateOrganisationDto })
  @ApiOkResponse({ description: 'Organisation renamed, deactivated or reactivated.' })
  @ApiBadRequestResponse({ description: 'Nothing to update.' })
  @ApiNotFoundResponse({ description: 'No such organisation in this tenant.' })
  @ApiConflictResponse({ description: 'Name already used by another organisation.' })
  async update(
    @Param('id', ParseUUIDPipe) organisationId: string,
    @Headers('tenantid') tenantId: string,
    @Req() request: any,
    @Body() dto: UpdateOrganisationDto,
    @Res() response: Response
  ) {
    const result = await this.organisationService.update(
      requireTenant(tenantId),
      actorOf(request),
      organisationId,
      dto
    );
    return APIResponse.success(
      response,
      APIID.ORGANISATION_UPDATE,
      result,
      HttpStatus.OK,
      API_RESPONSES.ORGANISATION_UPDATE_SUCCESS
    );
  }
}
