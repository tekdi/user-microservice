import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, ILike } from 'typeorm';
import { Response } from 'express';
import { Country } from '../countries/entities/country.entity';
import {
  ListCountriesQueryDto,
  ASPIRE_LEADERS_COUNTRY_LIST_DEFAULT_LIMIT,
  ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT,
} from './dto/list-countries.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { ReportCountryFilterDto } from './dto/report-country-filter.dto';
import { resolveReportCountryScope } from '@utils/report-country-scope';

@Injectable()
export class AspireLeadersSpecificService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Aspire Leaders-specific: narrows a chunk of userIds to those the calling
   * admin may see, by country, WITHOUT requiring a cohort.
   *
   * The cohort-scoped /cohortmember/report-filter cannot answer this for a
   * report scoped by something else (a pathway, say): the non-cohort id it
   * gets matches no CohortMembers row, and since that endpoint fails closed the
   * whole report comes back empty. This one asks only the country question.
   *
   * Scoping is on Users.currentCountry - the user's LIVE profile country, the
   * column every report scopes on except the application report, whose country
   * is a frozen property of the application itself.
   *
   * Identity is taken from the caller's verified token by the controller, never
   * from the body: country scoping is this endpoint's access-control boundary,
   * so a spoofable identity would defeat the point.
   *
   * Returns the ELIGIBLE userIds only, each with the currentCountry it matched
   * on, so a caller can both filter and render the country without a second
   * lookup. An ineligible userId is simply absent - callers test membership.
   */
  async reportCountryFilter(
    dto: ReportCountryFilterDto,
    adminUserId: string,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.ASPIRE_LEADERS_REPORT_COUNTRY_FILTER;
    try {
      const { userIds, countries } = dto;

      const empty = () =>
        APIResponse.success(
          response,
          apiId,
          { count: 0, items: [] },
          HttpStatus.OK,
          API_RESPONSES.ASPIRE_LEADERS_REPORT_COUNTRY_FILTER_SUCCESS,
        );

      // Nothing to match - skip the query rather than issuing `= ANY('{}')`.
      if (!userIds || userIds.length === 0) {
        return empty();
      }

      // The caller's own scope intersected with their requested countries.
      // `blocked` means the intersection is empty - a Regional Admin with no
      // resolvable country, or one asking only for countries outside their
      // assignment - and must yield nothing rather than everything.
      const scope = await resolveReportCountryScope(
        this.dataSource,
        adminUserId,
        countries,
      );
      if (scope.blocked) {
        return empty();
      }

      // A user whose currentCountry is null/blank is excluded whenever any
      // narrowing is active - we cannot confirm they match, and a report asked
      // for specific countries should not carry rows of unknown country. With
      // no narrowing at all (unscoped admin, no dropdown) every requested user
      // comes back, country included or null.
      const rows: { userId: string; currentCountry: string | null }[] =
        scope.countries
          ? await this.dataSource.query(
              `SELECT "userId", "currentCountry"
               FROM "Users"
               WHERE "userId" = ANY($1)
                 AND LOWER(TRIM("currentCountry")) = ANY($2)`,
              [userIds, scope.countries],
            )
          : await this.dataSource.query(
              `SELECT "userId", "currentCountry"
               FROM "Users"
               WHERE "userId" = ANY($1)`,
              [userIds],
            );

      const items = (rows ?? []).map((row) => ({
        userId: row.userId,
        currentCountry: row.currentCountry ?? null,
      }));

      return APIResponse.success(
        response,
        apiId,
        { count: items.length, items },
        HttpStatus.OK,
        API_RESPONSES.ASPIRE_LEADERS_REPORT_COUNTRY_FILTER_SUCCESS,
      );
    } catch (error) {
      const fullMessage = error?.message ?? String(error);
      LoggerUtil.error(
        API_RESPONSES.SERVER_ERROR,
        `Error in reportCountryFilter: ${fullMessage}${error?.stack ? `\n${error.stack}` : ''}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async listCountries(
    query: ListCountriesQueryDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.ASPIRE_LEADERS_COUNTRY_LIST;
    try {
      const whereCondition: Record<string, unknown> = {};

      if (query.name !== undefined && query.name.trim() !== '') {
        whereCondition.name = ILike(`%${query.name.trim()}%`);
      }
      if (query.is_active !== undefined) {
        whereCondition.is_active = query.is_active;
      }

      const requestedLimit = query.limit ?? ASPIRE_LEADERS_COUNTRY_LIST_DEFAULT_LIMIT;
      const limit = Math.min(requestedLimit, ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT);
      const offset = query.offset ?? 0;

      const [items, totalCount] = await this.countryRepository.findAndCount({
        where: whereCondition,
        order: { name: 'ASC' },
        take: limit,
        skip: offset,
        select: ['id', 'name', 'is_active', 'created_at'],
      });

      const result = {
        count: items.length,
        totalCount,
        limit,
        offset,
        items,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.ASPIRE_LEADERS_COUNTRY_LIST_SUCCESS,
      );
    } catch (error) {
      const fullMessage = error?.message ?? String(error);
      const stack = error?.stack;
      LoggerUtil.error(
        API_RESPONSES.SERVER_ERROR,
        `Error listing countries: ${fullMessage}${stack ? `\n${stack}` : ''}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
