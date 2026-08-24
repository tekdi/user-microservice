import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
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

@Injectable()
export class AspireLeadersSpecificService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

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
