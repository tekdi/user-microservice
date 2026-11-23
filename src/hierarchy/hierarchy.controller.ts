import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { isUUID } from 'class-validator';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from 'src/common/utils/api-id.config';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { HierarchyService } from './hierarchy.service';

@ApiTags('Hierarchy')
@Controller('hierarchy')
export class HierarchyController {
  constructor(private readonly hierarchyService: HierarchyService) {}

  /**
   * Task 17: the Learners the signed-in user may review (see HierarchyService).
   * The user comes from the verified token, never from the request.
   */
  @UseFilters(new AllExceptionsFilter(APIID.HIERARCHY_MY_SCOPE))
  @UseGuards(JwtAuthGuard)
  @Get('/my-scope')
  @ApiBasicAuth('access-token')
  @ApiHeader({ name: 'tenantid', required: true })
  @ApiOkResponse({ description: '{ all, groups[], userIds[] } for the caller' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  async getMyScope(
    @Headers() headers,
    @Req() request: any,
    @Res() response: Response
  ) {
    const userId = request.user?.userId;
    if (!userId || !isUUID(userId)) {
      throw new BadRequestException('unauthorized!');
    }
    const tenantId = headers['tenantid'];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const scope = await this.hierarchyService.getMyScope(userId, tenantId);
    return APIResponse.success(
      response,
      APIID.HIERARCHY_MY_SCOPE,
      scope,
      HttpStatus.OK,
      'Scope fetched successfully'
    );
  }
}
