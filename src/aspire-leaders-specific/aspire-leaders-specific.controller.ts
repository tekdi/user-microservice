import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
  ValidationPipe,
  BadRequestException,
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
import { Response, Request } from 'express';
import { isUUID } from 'class-validator';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { AspireLeadersSpecificService } from './aspire-leaders-specific.service';
import { ListCountriesQueryDto } from './dto/list-countries.dto';
import { ReportCountryFilterDto } from './dto/report-country-filter.dto';

interface RequestWithUser extends Request {
  user?: { userId: string; [key: string]: any };
}

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

  /**
   * Country-scopes a chunk of userIds for a report that has NO cohort - the
   * pathway assessment report, for one.
   *
   * The identity that decides the scope is taken from the bearer token
   * JwtAuthGuard has already verified against Keycloak's RSA public key, never
   * from a `userid` header or a body field: country scoping is this endpoint's
   * access-control boundary, so a spoofable caller would defeat it entirely.
   * Same rule as POST /cohortmember/report-filter.
   */
  @UseGuards(JwtAuthGuard)
  @Post('report-country-filter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Country-filter a chunk of userIds for a cohort-less report',
    description:
      "Returns the subset of the given userIds the calling admin may see, by country, each with the currentCountry it matched on. A Regional Admin is restricted to their assigned countries (resolved server-side); the optional `countries` body field narrows within that and can never widen it.",
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiBody({ type: ReportCountryFilterDto })
  @ApiResponse({
    status: 200,
    description: 'Eligible userIds retrieved successfully',
    schema: {
      example: {
        result: {
          count: 1,
          items: [
            {
              userId: 'a1b2c3d4-e111-2222-3333-444455556666',
              currentCountry: 'India',
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
  async reportCountryFilter(
    @Req() request: RequestWithUser,
    @Body() dto: ReportCountryFilterDto,
    @Res() response: Response,
  ): Promise<Response> {
    const adminUserId = request.user?.userId;
    if (!adminUserId || !isUUID(adminUserId)) {
      throw new BadRequestException('unauthorized!');
    }
    return this.aspireLeadersSpecificService.reportCountryFilter(
      dto,
      adminUserId,
      response,
    );
  }
}
