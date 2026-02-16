import { Injectable, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not, DataSource } from 'typeorm';
import { Tag, TagStatus } from './entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { DeleteTagDto } from './dto/delete-tag.dto';
import { ListTagDto } from './dto/list-tag.dto';
import { FetchTagDto } from './dto/fetch-tag.dto';
import { MAX_PAGINATION_LIMIT } from '../common/dto/pagination.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class TagsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private readonly dataSource: DataSource
  ) { }

  /**
   * Drop the old globally unique index if it exists to allow partial index to work
   */
  async onModuleInit() {
    try {
      // Attempt to drop any existing unique indexes/constraints on the name column
      // that might be blocking the partial index logic.
      const queries = [
        'DROP INDEX IF EXISTS "ux_tags_name"',
        'DROP INDEX IF EXISTS "tags_name_key"',
        'ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "ux_tags_name"',
        'ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_name_key"',
        'ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "UQ_d906660fb15e47855017ed7f83b"', // Possible TypeORM auto-generated name
      ];

      for (const query of queries) {
        try {
          await this.dataSource.query(query);
        } catch (e) {
          // Ignore errors (e.g. if constraint doesn't exist)
        }
      }
      LoggerUtil.log('TagsService', 'Attempted to cleanup legacy tag name indexes');
    } catch (error) {
      LoggerUtil.error('API_RESPONSES.SERVER_ERROR', `Error during Tag index cleanup: ${error.message}`);
    }
  }

  /**
   * Create a new tag
   * Optimized: Single query with conflict check
   */
  async create(
    createTagDto: CreateTagDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.TAG_CREATE;
    try {
      // Check if a PUBLISHED tag with same name already exists
      const existingPublished = await this.tagRepository.findOne({
        where: { name: createTagDto.name, status: TagStatus.PUBLISHED },
        select: ['id'],
      });

      if (existingPublished) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TAG_NAME_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      // Generate unique alias from name OR use provided custom alias
      // This will scan all tags (published/archived) and append suffix if needed
      const alias = await this.generateUniqueAlias(
        createTagDto.alias || createTagDto.name
      );

      // Create tag with provided data
      const tagData = {
        name: createTagDto.name,
        alias: alias,
        status: TagStatus.PUBLISHED,
        created_by: createTagDto.created_by,
      };

      // Create and save in single operation
      const tag = this.tagRepository.create(tagData);
      const savedTag = await this.tagRepository.save(tag);

      // Return all fields as per API spec
      const result = {
        id: savedTag.id,
        name: savedTag.name,
        alias: savedTag.alias,
        status: savedTag.status,
        created_at: savedTag.created_at,
        updated_at: savedTag.updated_at,
        created_by: savedTag.created_by,
        updated_by: savedTag.updated_by,
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
        LoggerUtil.error(
          `${API_RESPONSES.CONFLICT}`,
          `Conflict error details: ${error.detail}`,
          apiId
        );
        // PostgreSQL unique constraint violation
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          `${API_RESPONSES.TAG_NAME_EXISTS} (${error.detail})`,
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
        select: ['id', 'name', 'alias', 'status', 'created_at'],
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

      // Prepare update data - filter out undefined values
      const updateData: Partial<Tag> = {};

      // If name is being changed, check if new name conflicts with an existing PUBLISHED tag
      if (updateTagDto.name && updateTagDto.name !== existingTag.name) {
        const nameConflict = await this.tagRepository.findOne({
          where: { name: updateTagDto.name, status: TagStatus.PUBLISHED },
          select: ['id'],
        });

        if (nameConflict) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            API_RESPONSES.TAG_NAME_EXISTS,
            HttpStatus.CONFLICT
          );
        }
        updateData.name = updateTagDto.name;
      }

      // If alias is being changed, check for GLOBAL uniqueness (published or archived)
      // Note: We DO NOT auto-suffix in update, we ask the user for a unique one.
      if (updateTagDto.alias && updateTagDto.alias !== existingTag.alias) {
        const aliasConflict = await this.tagRepository.findOne({
          where: { alias: updateTagDto.alias },
          select: ['id'],
        });

        if (aliasConflict) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            'Tag with this alias already exists',
            HttpStatus.CONFLICT
          );
        }
        updateData.alias = updateTagDto.alias;
      }

      if (updateTagDto.status !== undefined) {
        updateData.status = updateTagDto.status;
      }

      if (updateTagDto.updated_by !== undefined) {
        updateData.updated_by = updateTagDto.updated_by;
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
        select: [
          'id',
          'name',
          'alias',
          'status',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
        ],
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
        LoggerUtil.error(
          `${API_RESPONSES.CONFLICT}`,
          `Update conflict error details: ${error.detail}`,
          apiId
        );
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          `${API_RESPONSES.TAG_NAME_EXISTS} (${error.detail})`,
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
   * Optimized: Single update query with audit fields
   */
  async delete(
    deleteTagDto: DeleteTagDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.TAG_DELETE;
    const { id, updated_by, status } = deleteTagDto;
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
        {
          status: status || TagStatus.ARCHIVED,
          updated_by: updated_by,
          updated_at: new Date(),
        }
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
        status: status || TagStatus.ARCHIVED,
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
      // Build where clause
      const whereCondition: Partial<Tag> = {};

      // If status is provided, use it; otherwise default to published only
      if (listTagDto.status) {
        whereCondition.status = listTagDto.status;
      } else {
        // Default: only show published tags (exclude archived)
        whereCondition.status = TagStatus.PUBLISHED;
      }

      // Set pagination defaults with safeguard to prevent unbounded queries
      // Defense in depth: cap limit even if validation is bypassed
      const requestedLimit = listTagDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listTagDto.offset ?? 0;

      // OPTIMIZED: Single query with count and data using findAndCount
      // This performs both COUNT and SELECT in an optimized way
      const [items, totalCount] = await this.tagRepository.findAndCount({
        where: whereCondition,
        order: {
          created_at: 'DESC',
        },
        take: limit,
        skip: offset,
        select: [
          'id',
          'name',
          'alias',
          'status',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
        ],
      });

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
        select: [
          'id',
          'name',
          'alias',
          'status',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
        ],
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

  /**
   * Generate a unique, URL-friendly alias from a given name
   * Optimized: Uses a single LIKE query to find all conflicting aliases
   */
  private async generateUniqueAlias(
    name: string,
    excludeId?: string
  ): Promise<string> {
    // Step 1: Normalization
    let alias = name
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, '_')
      .replace(/-/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!alias) {
      alias = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    }

    // Step 2: Optimized uniqueness check using prefix search
    // This uses the index on 'alias' for efficiency
    const existingAliases = await this.tagRepository.find({
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

    // Step 3: Find next available numeric suffix in memory
    let counter = 1;
    let uniqueAlias = `${alias}_${counter}`;
    while (aliasSet.has(uniqueAlias)) {
      counter++;
      uniqueAlias = `${alias}_${counter}`;
    }

    return uniqueAlias;
  }
}
