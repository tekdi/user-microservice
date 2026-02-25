import {
  Controller,
  Delete,
  HttpStatus,
  UseGuards,
  Headers,
  BadRequestException,
  Res,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { CacheService } from './cache.service';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { Response } from 'express';
import { isUUID } from 'class-validator';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import APIResponse from 'src/common/responses/response';

@ApiTags('Cache')
@Controller('cache')
@UseGuards(JwtAuthGuard)
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Clear all cache entries across services (LMS, Assessment, User Events)
   */
  @Delete('clear')
  @ApiOperation({
    summary: 'Clear all Redis cache',
    description:
      'Clears all Redis cache entries for all services (LMS, Assessment, User Events). Requires Superadmin or Regional Admin role.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Cache cleared successfully',
    schema: {
      example: {
        id: 'api.cache.clear.all',
        ver: '1.0',
        ts: '2026-02-25T14:00:00+05:30',
        params: { status: 'success' },
        responseCode: 'OK',
        result: { cleared: true },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request - Invalid tenant ID' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  async clearCache(
    @Headers('tenantid') tenantId: string,
    @Res() response: Response,
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      return APIResponse.error(
        response,
        APIID.CACHE_CLEAR_ALL,
        'BAD_REQUEST',
        API_RESPONSES.TENANTID_VALIDATION,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.cacheService.clearAllServicesCache();

      if (result.cleared) {
        this.logger.log('Successfully cleared all cache entries.');
        return APIResponse.success(
          response,
          APIID.CACHE_CLEAR_ALL,
          result,
          HttpStatus.OK,
          'Cache cleared successfully',
        );
      } else {
        this.logger.warn('Cache clear skipped: Cache is disabled or not connected.');
        return APIResponse.success(
          response,
          APIID.CACHE_CLEAR_ALL,
          result,
          HttpStatus.OK,
          'Cache clear skipped: Cache is disabled or not connected',
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error clearing cache: ${error.message}`,
        error.stack,
      );
      return APIResponse.error(
        response,
        APIID.CACHE_CLEAR_ALL,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        "Failed to clear cache",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
