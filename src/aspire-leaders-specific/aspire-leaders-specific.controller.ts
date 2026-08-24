import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AspireLeadersSpecificService } from './aspire-leaders-specific.service';
import { ListCountriesQueryDto } from './dto/list-countries.dto';

@ApiTags('Aspire Leaders Specific')
@Controller('aspire-leaders-specific')
export class AspireLeadersSpecificController {
  constructor(
    private readonly aspireLeadersSpecificService: AspireLeadersSpecificService,
  ) {}

  @Post('countries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List countries',
    description:
      'Retrieves countries with optional filter by name (case-insensitive partial match) and status (is_active), with pagination and total count. Default limit is 500.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiBody({
    type: ListCountriesQueryDto,
    required: false,
    examples: {
      all: {
        summary: 'List all countries',
        value: {},
      },
      paginated: {
        summary: 'List with pagination',
        value: { limit: 20, offset: 0 },
      },
      byName: {
        summary: 'Search by name',
        value: { name: 'India' },
      },
      byStatus: {
        summary: 'Filter by active status',
        value: { is_active: true },
      },
      combined: {
        summary: 'Pagination, name search and status',
        value: { name: 'United', is_active: true, limit: 20, offset: 0 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Countries retrieved successfully',
    schema: {
      example: {
        result: {
          count: 1,
          totalCount: 1,
          limit: 500,
          offset: 0,
          items: [
            {
              id: 'a1b2c3d4-e111-2222-3333-444455556666',
              name: 'India',
              is_active: true,
              created_at: '2026-03-02T12:00:00.000Z',
            },
          ],
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listCountries(
    @Body() query: ListCountriesQueryDto,
    @Res() response: Response,
  ): Promise<Response> {
    return this.aspireLeadersSpecificService.listCountries(query, response);
  }
}
