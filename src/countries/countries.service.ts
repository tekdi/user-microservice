import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Country } from './entities/country.entity';
import { ListCountryDto } from './dto/list-country.dto';
import { MAX_PAGINATION_LIMIT } from '../pathways/common/dto/pagination.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  /**
   * List countries with optional filter by name (search) and status (is_active), with pagination
   */
  async list(
    listCountryDto: ListCountryDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.COUNTRY_LIST;
    try {
      const whereCondition: Record<string, unknown> = {};

      if (listCountryDto.name !== undefined && listCountryDto.name.trim() !== '') {
        whereCondition.name = ILike(`%${listCountryDto.name.trim()}%`);
      }
      if (listCountryDto.is_active !== undefined) {
        whereCondition.is_active = listCountryDto.is_active;
      }

      const requestedLimit = listCountryDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listCountryDto.offset ?? 0;

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
        API_RESPONSES.COUNTRY_LIST_SUCCESS,
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
