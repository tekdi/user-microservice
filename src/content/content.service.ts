import * as crypto from 'crypto';
import {
  Injectable,
  ConflictException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Content } from './entities/content.entity';
import { CreateContentDto } from './dto/create-content.dto';
import APIResponse from 'src/common/responses/response';
import { APIID } from '@utils/api-id.config';
import { Response } from 'express';
import { StringUtil } from './utils/string.util';
import { Repository, Not, Like, ILike, Between, QueryFailedError } from 'typeorm';
import { UpdateContentDto } from './dto/update-content.dto';
import { ListContentDto } from './dto/list-content.dto';
import { MAX_PAGINATION_LIMIT } from 'src/common/dto/pagination.dto';
import { CacheService } from 'src/cache/cache.service';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly contentListCacheTtl: number;

  constructor(
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    const ttlConfig = this.configService.get('CONTENT_LIST_CACHE_TTL_SECONDS');
    const parsedTtl = parseInt(ttlConfig, 10);
    this.contentListCacheTtl = !isNaN(parsedTtl) ? parsedTtl : 1800; // Default to 30 mins
  }

  async list(
    listContentDto: ListContentDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.CONTENT_LIST;
    try {
      const cacheKey = this.generateContentListCacheKey(listContentDto);
      let cachedResult: any = null;
      try {
        cachedResult = await this.cacheService.get(cacheKey);
      } catch (cacheReadError: any) {
        this.logger.warn(
          `Content list cache read failed, falling through to DB: ${cacheReadError?.message || cacheReadError}`,
        );
      }

      if (cachedResult) {
        this.logger.debug(`Cache HIT for content list: ${cacheKey}`);
        return APIResponse.success(
          response,
          apiId,
          cachedResult,
          HttpStatus.OK,
          'Content list retrieved successfully',
        );
      }
      this.logger.debug(`Cache MISS for content list: ${cacheKey}`);

      const requestedLimit = listContentDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listContentDto.offset ?? 0;

      const filters = listContentDto.filters || {};
      const whereCondition: any = {};

      if (filters.id) {
        whereCondition.id = filters.id;
      }
      if (filters.isActive !== undefined) {
        whereCondition.isActive = filters.isActive;
      }
      if (filters.createdBy) {
        whereCondition.createdBy = filters.createdBy;
      }
      if (filters.name) {
        whereCondition.name = ILike(`%${filters.name}%`);
      }
      if (filters.alias) {
        whereCondition.alias = ILike(`%${filters.alias}%`);
      }
      if (filters.createdAt) {
        const start = new Date(filters.createdAt);
        if (!isNaN(start.getTime())) {
          const end = new Date(filters.createdAt);
          start.setUTCHours(0, 0, 0, 0);
          end.setUTCHours(23, 59, 59, 999);
          whereCondition.createdAt = Between(start, end);
        }
      }

      const [items, totalCount] = await this.contentRepository.findAndCount({
        where: whereCondition,
        order: {
          createdAt: 'DESC',
        },
        take: limit,
        skip: offset,
      });

      const result = {
        count: totalCount,
        limit,
        offset,
        items,
      };

      // Cache successful list response (best-effort, non-blocking)
      try {
        await this.cacheService.set(cacheKey, result, this.contentListCacheTtl);
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to cache content list result: ${cacheError?.message || cacheError}`,
        );
      }

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        'Content list retrieved successfully',
      );
    } catch (error) {
      this.logger.error(`Error in list content: ${error.message}`, error.stack);
      return APIResponse.error(
        response,
        apiId,
        'Internal Server Error',
        'Failed to retrieve content list',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(
    id: string,
    updateContentDto: UpdateContentDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.CONTENT_UPDATE;
    try {
      const existingContent = await this.contentRepository.findOne({
        where: { id },
      });

      if (!existingContent) {
        return APIResponse.error(
          response,
          apiId,
          'Not Found',
          'Content not found',
          HttpStatus.NOT_FOUND,
        );
      }

      const updateData: Partial<Content> = { ...updateContentDto };

      // If alias is explicitly provided, check if it already exists in another record
      if (updateContentDto.alias && updateContentDto.alias !== existingContent.alias) {
        const aliasExists = await this.contentRepository.findOne({
          where: { 
            alias: updateContentDto.alias,
            id: Not(id)
          },
        });

        if (aliasExists) {
          return APIResponse.error(
            response,
            apiId,
            'Conflict',
            'Content with this alias already exists',
            HttpStatus.CONFLICT,
          );
        }
      }

      await this.contentRepository.update(id, updateData);
      
      // Invalidate content list cache after successful update
      try {
        await this.cacheService.delByPattern('content:list:*');
        this.logger.debug('Invalidated content list cache after update');
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to invalidate content list cache: ${cacheError?.message || cacheError}`,
        );
      }

      const updatedContent = await this.contentRepository.findOne({
        where: { id },
      });

      return APIResponse.success(
        response,
        apiId,
        updatedContent,
        HttpStatus.OK,
        'Content updated successfully',
      );
    } catch (error) {
      this.logger.error(`Error in update content: ${error.message}`, error.stack);
      
      // Check for PostgreSQL unique_violation (e.g. alias collision during concurrent update)
      if (error instanceof QueryFailedError && (error as any).code === '23505') {
        return APIResponse.error(
          response,
          apiId,
          'Conflict',
          'Content with this alias already exists',
          HttpStatus.CONFLICT,
        );
      }

      return APIResponse.error(
        response,
        apiId,
        'Internal Server Error',
        'Failed to update content',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(
    createContentDto: CreateContentDto,
    response: Response,
  ): Promise<Response> {
    try {
      // Generate unique alias from name OR use provided custom alias
      const alias = await this.generateUniqueAlias(
        createContentDto.alias || createContentDto.name,
      );

      const newContent = this.contentRepository.create({
        ...createContentDto,
        alias,
      });
      const savedContent = await this.contentRepository.save(newContent);

      // Invalidate content list cache after successful creation
      try {
        await this.cacheService.delByPattern('content:list:*');
        this.logger.debug('Invalidated content list cache after creation');
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to invalidate content list cache: ${cacheError?.message || cacheError}`,
        );
      }

      return APIResponse.success(
        response,
        APIID.CONTENT_CREATE,
        savedContent,
        HttpStatus.CREATED,
        'Content created successfully',
      );
    } catch (error) {
      this.logger.error(`Error in create content: ${error.message}`, error.stack);
      
      // Check for PostgreSQL unique_violation (e.g. alias collision during concurrent insert)
      if (error instanceof QueryFailedError && (error as any).code === '23505') {
        return APIResponse.error(
          response,
          APIID.CONTENT_CREATE,
          'Conflict',
          'Content with this alias already exists',
          HttpStatus.CONFLICT,
        );
      }

      if (error instanceof ConflictException) {
        throw error;
      }
      return APIResponse.error(
        response,
        APIID.CONTENT_CREATE,
        'Internal Server Error',
        'Failed to create content',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generate a unique, URL-friendly alias from a given name
   */
  private async generateUniqueAlias(
    name: string,
    excludeId?: string,
  ): Promise<string> {
    // Step 1: Normalization
    let alias = StringUtil.normalizeKey(name);

    if (!alias) {
      alias = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    }

    // Step 2: Optimized uniqueness check using prefix search
    const existingAliases = await this.contentRepository.find({
      where: {
        alias: Like(`${alias}%`),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
      select: ['alias'],
    });

    if (existingAliases.length === 0) {
      return alias;
    }

    const aliasSet = new Set(existingAliases.map((t) => t.alias));
    if (!aliasSet.has(alias)) {
      return alias;
    }

    // Step 3: Find next available numeric suffix
    let counter = 1;
    let uniqueAlias = `${alias}_${counter}`;
    while (aliasSet.has(uniqueAlias)) {
      counter++;
      uniqueAlias = `${alias}_${counter}`;
    }

    return uniqueAlias;
  }

  /**
   * Generate a stable cache key for content list.
   */
  private generateContentListCacheKey(listContentDto: ListContentDto): string {
    const requestedLimit = listContentDto.limit ?? 10;
    const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
    const offset = listContentDto.offset ?? 0;
    const filters = listContentDto.filters || {};
    const cacheKeyObject = {
      id: filters.id,
      name: filters.name,
      alias: filters.alias,
      createdBy: filters.createdBy,
      isActive: filters.isActive,
      createdAt: filters.createdAt,
      limit,
      offset,
    };
    const sortedKeys = Object.keys(cacheKeyObject).sort((a, b) =>
      a.localeCompare(b),
    );
    const sortedObject: any = {};
    for (const key of sortedKeys) {
      sortedObject[key] = (cacheKeyObject as any)[key];
    }
    const keyString = JSON.stringify(sortedObject);
    const hash = crypto.createHash('sha256').update(keyString).digest('hex');
    return `content:list:${hash}`;
  }
}
