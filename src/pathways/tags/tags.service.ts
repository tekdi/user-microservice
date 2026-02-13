import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Tag, TagStatus } from './entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ListTagDto } from './dto/list-tag.dto';
import { FetchTagDto } from './dto/fetch-tag.dto';
import { MAX_PAGINATION_LIMIT } from '../common/dto/pagination.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>
  ) {}

  /**
   * Create a new tag
   * Optimized: Single query with conflict check
   */
  async create(
    createTagDto: CreateTagDto,
    userId: string | null,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.TAG_CREATE;
    try {
      // Check if tag with same name already exists
      const existingTag = await this.tagRepository.findOne({
        where: { name: createTagDto.name },
        select: ['id', 'name'],
      });

      if (existingTag) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TAG_NAME_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      // Create tag with default status 'published'
      const tagData = {
        name: createTagDto.name,
        status: TagStatus.PUBLISHED,
        created_by: userId,
        updated_by: userId,
      };

      // Create and save in single operation
      const tag = this.tagRepository.create(tagData);
      const savedTag = await this.tagRepository.save(tag);

      // Return all fields as per API spec
      const result = {
        id: savedTag.id,
        name: savedTag.name,
        status: savedTag.status,
        created_at: savedTag.created_at,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.TAG_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        // PostgreSQL unique constraint violation
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TAG_NAME_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error creating tag: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Update a tag
   * Optimized: Use repository.update() for partial updates
   */
  async update(
    id: string,
    updateTagDto: UpdateTagDto,
    userId: string | null,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.TAG_UPDATE;
    try {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if tag exists
      const existingTag = await this.tagRepository.findOne({
        where: { id },
        select: ['id', 'name', 'status', 'created_at'],
      });

      if (!existingTag) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TAG_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // Check if name is being updated and if new name already exists
      if (updateTagDto.name && updateTagDto.name !== existingTag.name) {
        const nameExists = await this.tagRepository.findOne({
          where: { name: updateTagDto.name },
          select: ['id'],
        });

        if (nameExists) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            API_RESPONSES.TAG_NAME_EXISTS,
            HttpStatus.CONFLICT
          );
        }
      }

      // Prepare update data - filter out undefined values
      const updateData: Partial<Tag> = {};
      if (updateTagDto.name !== undefined) {
        updateData.name = updateTagDto.name;
      }
      if (updateTagDto.status !== undefined) {
        updateData.status = updateTagDto.status;
      }

      // Always set updated_by when updating
      if (userId) {
        updateData.updated_by = userId;
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'No valid fields provided for update',
          HttpStatus.BAD_REQUEST
        );
      }

      // OPTIMIZED: Use repository.update() for partial updates
      // updated_at is automatically updated by UpdateDateColumn decorator
      const updateResult = await this.tagRepository.update({ id }, updateData);

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          'Failed to update tag',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      // Fetch updated tag for response
      const updatedTag = await this.tagRepository.findOne({
        where: { id },
        select: ['id', 'name', 'status', 'created_at'],
      });

      return APIResponse.success(
        response,
        apiId,
        updatedTag,
        HttpStatus.OK,
        API_RESPONSES.TAG_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TAG_NAME_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error updating tag: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Soft delete a tag (set status to archived)
   * Optimized: Single update query
   */
  async delete(id: string, response: Response): Promise<Response> {
    const apiId = APIID.TAG_DELETE;
    try {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if tag exists
      const existingTag = await this.tagRepository.findOne({
        where: { id },
        select: ['id', 'status'],
      });

      if (!existingTag) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TAG_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // OPTIMIZED: Soft delete by updating status to archived in single query
      const updateResult = await this.tagRepository.update(
        { id },
        { status: TagStatus.ARCHIVED }
      );

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          'Failed to archive tag',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      // Return result as per API spec
      const result = {
        id: id,
        status: TagStatus.ARCHIVED,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.TAG_ARCHIVED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error archiving tag: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * List tags with optional filtering and pagination
   * Optimized: Single query with proper filtering
   * Note: Archived tags are excluded by default unless explicitly requested
   */
  async list(listTagDto: ListTagDto, response: Response): Promise<Response> {
    const apiId = APIID.TAG_LIST;
    try {
      // Set pagination defaults with safeguard to prevent unbounded queries
      // Defense in depth: cap limit even if validation is bypassed
      const requestedLimit = listTagDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listTagDto.offset ?? 0;

      // Extract filters from nested object
      const filters = listTagDto.filters || {};

      // Check if we need QueryBuilder for text search (name)
      const needsTextSearch = !!filters.name;
      let items: Tag[];
      let totalCount: number;

      if (needsTextSearch) {
        // Use QueryBuilder for ILIKE queries (optimized for text search)
        const queryBuilder = this.tagRepository.createQueryBuilder("tag");

        // Apply filters
        if (filters.id) {
          queryBuilder.andWhere("tag.id = :id", { id: filters.id });
        }
        if (filters.name) {
          queryBuilder.andWhere("tag.name ILIKE :name", { name: `%${filters.name}%` });
        }
        // If status is provided, use it; otherwise default to published only
        if (filters.status) {
          queryBuilder.andWhere("tag.status = :status", { status: filters.status });
        } else {
          // Default: only show published tags (exclude archived)
          queryBuilder.andWhere("tag.status = :status", { status: TagStatus.PUBLISHED });
        }

        // Apply ordering
        queryBuilder.orderBy("tag.created_at", "DESC");

        // Apply pagination
        queryBuilder.skip(offset).take(limit);

        // Select specific fields
        queryBuilder.select(["tag.id", "tag.name", "tag.status", "tag.created_at"]);

        // Execute query
        [items, totalCount] = await queryBuilder.getManyAndCount();
      } else {
        // Use findAndCount for simple filters (more efficient when no text search)
        const whereCondition: Partial<Tag> = {};

        if (filters.id) {
          whereCondition.id = filters.id;
        }

        // If status is provided, use it; otherwise default to published only
        if (filters.status) {
          whereCondition.status = filters.status;
        } else {
          // Default: only show published tags (exclude archived)
          whereCondition.status = TagStatus.PUBLISHED;
        }

        // OPTIMIZED: Single query with count and data using findAndCount
        // This performs both COUNT and SELECT in an optimized way
        [items, totalCount] = await this.tagRepository.findAndCount({
          where: whereCondition,
          order: {
            created_at: "DESC",
          },
          take: limit,
          skip: offset,
          select: ["id", "name", "status", "created_at"],
        });
      }

      // Return paginated result with count, limit, and offset
      const result = {
        count: items.length,
        totalCount: totalCount,
        limit: limit,
        offset: offset,
        items: items,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.TAG_LIST_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing tags: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Fetch a single tag by ID
   * Optimized: Single query with proper error handling
   */
  async fetch(fetchTagDto: FetchTagDto, response: Response): Promise<Response> {
    const apiId = APIID.TAG_READ;
    try {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(fetchTagDto.id)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

      // Single query to fetch tag
      const tag = await this.tagRepository.findOne({
        where: { id: fetchTagDto.id },
        select: ['id', 'name', 'status', 'created_at'],
      });

      if (!tag) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TAG_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        tag,
        HttpStatus.OK,
        API_RESPONSES.TAG_GET_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error fetching tag: ${errorMessage}`,
        apiId
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
