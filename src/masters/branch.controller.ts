import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
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
  BranchListDto,
  CreateBranchDto,
  DistrictListDto,
  UpdateBranchDto,
} from './dto/masters.dto';
import { BranchService } from './branch.service';
import { actorOf, requireTenant } from './masters.util';
import { MASTERS_VALIDATION } from './organisation.controller';

@ApiTags('Masters - Branch Management')
@Controller('masters')
@UseGuards(JwtAuthGuard)
@ApiBasicAuth('access-token')
@ApiHeader({ name: 'tenantid', required: true })
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @UseFilters(new AllExceptionsFilter(APIID.STATE_LIST))
  @Post('state/list')
  @ApiOkResponse({ description: 'States in the master list.' })
  async listStates(@Headers('tenantid') tenantId: string, @Res() response: Response) {
    const result = await this.branchService.listStates(requireTenant(tenantId));
    return APIResponse.success(
      response,
      APIID.STATE_LIST,
      result,
      HttpStatus.OK,
      API_RESPONSES.STATE_LIST_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.DISTRICT_LIST))
  @Post('district/list')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: DistrictListDto })
  @ApiOkResponse({ description: 'Districts in the master list, optionally of one state.' })
  async listDistricts(
    @Headers('tenantid') tenantId: string,
    @Body() dto: DistrictListDto,
    @Res() response: Response
  ) {
    const result = await this.branchService.listDistricts(requireTenant(tenantId), dto?.stateValue);
    return APIResponse.success(
      response,
      APIID.DISTRICT_LIST,
      result,
      HttpStatus.OK,
      API_RESPONSES.DISTRICT_LIST_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.BRANCH_LIST))
  @Post('branch/list')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: BranchListDto })
  @ApiOkResponse({ description: 'Branches with district, state and user counts.' })
  async list(
    @Headers('tenantid') tenantId: string,
    @Body() dto: BranchListDto,
    @Res() response: Response
  ) {
    const result = await this.branchService.list(requireTenant(tenantId), dto);
    return APIResponse.success(
      response,
      APIID.BRANCH_LIST,
      result,
      HttpStatus.OK,
      API_RESPONSES.BRANCH_LIST_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.BRANCH_CREATE))
  @Post('branch/create')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: CreateBranchDto })
  @ApiCreatedResponse({ description: 'Branch created under the district.' })
  @ApiConflictResponse({ description: 'Code already used, or name already used in the district.' })
  async create(
    @Headers('tenantid') tenantId: string,
    @Req() request: any,
    @Body() dto: CreateBranchDto,
    @Res() response: Response
  ) {
    const result = await this.branchService.create(requireTenant(tenantId), actorOf(request), dto);
    return APIResponse.success(
      response,
      APIID.BRANCH_CREATE,
      result,
      HttpStatus.CREATED,
      API_RESPONSES.BRANCH_CREATE_SUCCESS
    );
  }

  @UseFilters(new AllExceptionsFilter(APIID.BRANCH_UPDATE))
  @Patch('branch/update/:value')
  @UsePipes(MASTERS_VALIDATION)
  @ApiBody({ type: UpdateBranchDto })
  @ApiOkResponse({ description: 'Branch renamed, deactivated or reactivated.' })
  @ApiNotFoundResponse({ description: 'No such branch in this tenant.' })
  @ApiConflictResponse({ description: 'Name already used in the district.' })
  async update(
    @Param('value') value: string,
    @Headers('tenantid') tenantId: string,
    @Req() request: any,
    @Body() dto: UpdateBranchDto,
    @Res() response: Response
  ) {
    const result = await this.branchService.update(
      requireTenant(tenantId),
      actorOf(request),
      value,
      dto
    );
    return APIResponse.success(
      response,
      APIID.BRANCH_UPDATE,
      result,
      HttpStatus.OK,
      API_RESPONSES.BRANCH_UPDATE_SUCCESS
    );
  }
}
