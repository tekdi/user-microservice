import {
  Controller,
  Post,
  Body,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
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
import { CountriesService } from './countries.service';
import { ListCountryDto } from './dto/list-country.dto';
import { Response } from 'express';
import { API_RESPONSES } from '@utils/response.messages';
import { isUUID } from 'class-validator';

@ApiTags('Countries')
@Controller('country')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Post('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List countries',
    description:
      'Retrieves a list of countries with optional pagination, search by name (case-insensitive partial match), and filter by status (is_active).',
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
  @ApiBody({
    type: ListCountryDto,
    required: false,
    examples: {
      all: {
        summary: 'List all countries',
        value: {},
      },
      paginated: {
        summary: 'List with pagination',
        value: { limit: 10, offset: 0 },
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
          limit: 10,
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
  async list(
    @Body() listCountryDto: ListCountryDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response,
  ): Promise<Response> {
   
    return this.countriesService.list(listCountryDto, response);
  }
}
