import { Injectable, HttpStatus, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, Not, DataSource } from "typeorm";
import * as crypto from "node:crypto";
import { CacheService } from "src/cache/cache.service";
import { Tag, TagStatus } from "./entities/tag.entity";
import { StringUtil } from "../common/utils/string.util";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { DeleteTagDto } from "./dto/delete-tag.dto";
import { ListTagDto } from "./dto/list-tag.dto";
import { FetchTagDto } from "./dto/fetch-tag.dto";
import { MAX_PAGINATION_LIMIT } from "../common/dto/pagination.dto";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { Response } from "express";

@Injectable()
export class TagsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService
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
          LoggerUtil.warn(
            "TagsService",
            `Ignored error during index drop: ${e.message}`
          );
        }
      }
      LoggerUtil.log(
        "TagsService",
        "Attempted to cleanup legacy tag name indexes"
      );
    } catch (error) {
      LoggerUtil.error(
        "API_RESPONSES.SERVER_ERROR",
        `Error during Tag index cleanup: ${error.message}`
      );
    }
  }

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
      // Check if a PUBLISHED tag with same name already exists
      const existingPublished = await this.tagRepository.findOne({
        where: { name: createTagDto.name, status: TagStatus.PUBLISHED },
        select: ["id"],
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
        created_by: userId || createTagDto.created_by || null,
        updated_by: userId || createTagDto.created_by || null,
      };

      // Create and save in single operation
      const tag = this.tagRepository.create(tagData);
      const savedTag = await this.tagRepository.save(tag);

      // Invalidate tag search cache after successful creation
      try {
        await this.cacheService.delByPattern("tags:search:*");
        LoggerUtil.log("Invalidated tag search cache after creation", apiId);
      } catch (cacheError) {
        LoggerUtil.warn(
          `Failed to invalidate tag search cache: ${cacheError.message}`,
          apiId
        );
      }

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
      if (error.code === "23505") {
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
    userId: string | null,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.TAG_UPDATE;
    try {
      if (!this.isValidUUID(id)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

      const existingTag = await this.tagRepository.findOne({
        where: { id },
        select: ["id", "name", "alias", "status", "created_at"],
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

      const payload = await this.prepareUpdatePayload(
        id,
        updateTagDto,
        existingTag,
        userId,
        apiId,
        response
      );
      if (payload.error) return payload.error;

      await this.tagRepository.update(
        { id },
        { ...payload.data, updated_at: new Date() }
      );

      await this.invalidateTagCache(apiId);

      const updatedTag = await this.tagRepository.findOne({ where: { id } });
      return APIResponse.success(
        response,
        apiId,
        updatedTag,
        HttpStatus.OK,
        API_RESPONSES.TAG_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      return this.handleUpdateError(error, apiId, response);
    }
  }

  /**
   * Helper to prepare update data for tag
   */
  private async prepareUpdatePayload(
    id: string,
    dto: UpdateTagDto,
    existing: Tag,
    userId: string | null,
    apiId: string,
    response: Response
  ): Promise<{ data?: Partial<Tag>; error?: Response }> {
    const data: Partial<Tag> = {};

    if (dto.name && dto.name !== existing.name) {
      if (await this.checkNameConflict(dto.name)) {
        return {
          error: APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            API_RESPONSES.TAG_NAME_EXISTS,
            HttpStatus.CONFLICT
          ),
        };
      }
      data.name = dto.name;
    }

    if (dto.alias && dto.alias !== existing.alias) {
      if (await this.checkAliasConflict(dto.alias)) {
        return {
          error: APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            "Tag with this alias already exists",
            HttpStatus.CONFLICT
          ),
        };
      }
      data.alias = dto.alias;
    }

    if (dto.status !== undefined) data.status = dto.status;
    if (userId || dto.updated_by) data.updated_by = userId || dto.updated_by;

    if (Object.keys(data).length === 0) {
      return {
        error: APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "No valid fields provided for update",
          HttpStatus.BAD_REQUEST
        ),
      };
    }

    return { data };
  }

  /**
   * Helper to invalidate tag cache
   */
  private async invalidateTagCache(apiId: string) {
    try {
      await this.cacheService.delByPattern("tags:search:*");
      LoggerUtil.log(`Invalidated tag search cache`, apiId);
    } catch (e) {
      LoggerUtil.warn(`Failed to invalidate tag search cache: ${e.message}`, apiId);
    }
  }

  /**
   * Helper to handle update errors
   */
  private handleUpdateError(
    error: any,
    apiId: string,
    response: Response
  ): Response {
    if (error.code === "23505") {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.CONFLICT,
        `${API_RESPONSES.TAG_NAME_EXISTS} (${error.detail})`,
        HttpStatus.CONFLICT
      );
    }
    const msg = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
    LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, msg, apiId);
    return APIResponse.error(
      response,
      apiId,
      API_RESPONSES.INTERNAL_SERVER_ERROR,
      msg,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
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
        select: ["id", "status"],
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

      // Invalidate tag search cache after successful archiving (soft delete)
      try {
        await this.cacheService.delByPattern("tags:search:*");
        LoggerUtil.log("Invalidated tag search cache after archiving", apiId);
      } catch (cacheError) {
        LoggerUtil.warn(
          `Failed to invalidate tag search cache: ${cacheError.message}`,
          apiId
        );
      }

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          "Failed to archive tag",
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
      const cacheKey = this.generateTagListCacheKey(listTagDto);
      const cached = await this.cacheService.get<any>(cacheKey);

      if (cached) {
        LoggerUtil.log(`Cache HIT for tag search: ${cacheKey}`, apiId);
        return APIResponse.success(
          response,
          apiId,
          cached,
          HttpStatus.OK,
          API_RESPONSES.TAG_LIST_SUCCESS
        );
      }

      LoggerUtil.log(`Cache MISS for tag search: ${cacheKey}`, apiId);
      const limit = Math.min(listTagDto.limit ?? 10, MAX_PAGINATION_LIMIT);
      const offset = listTagDto.offset ?? 0;

      const { items, totalCount } = await this.fetchTagsFromDb(
        listTagDto,
        limit,
        offset
      );

      const result = { count: totalCount, limit, offset, items };
      await this.cacheService.set(cacheKey, result, 300);

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.TAG_LIST_SUCCESS
      );
    } catch (error) {
      return this.handleListError(error, apiId, response);
    }
  }

  /**
   * Helper to generate cache key for tag list
   */
  private generateTagListCacheKey(dto: ListTagDto): string {
    return `tags:search:${crypto
      .createHash("sha256")
      .update(
        JSON.stringify(
          dto,
          Object.keys(dto).sort((a, b) => a.localeCompare(b))
        )
      )
      .digest("hex")}`;
  }

  /**
   * Helper to fetch tags from DB with filtering
   */
  private async fetchTagsFromDb(
    dto: ListTagDto,
    limit: number,
    offset: number
  ): Promise<{ items: Tag[]; totalCount: number }> {
    const filters = dto.filters || {};
    const needsTextSearch = !!filters.name;

    if (needsTextSearch) {
      const qb = this.tagRepository.createQueryBuilder("tag");
      if (filters.id) qb.andWhere("tag.id = :id", { id: filters.id });
      if (filters.name) qb.andWhere("tag.name ILIKE :name", { name: `%${filters.name}%` });

      const status = filters.status || TagStatus.PUBLISHED;
      qb.andWhere("tag.status = :status", { status });

      qb.orderBy("tag.created_at", "DESC");
      qb.skip(offset).take(limit);
      qb.select([
        "tag.id", "tag.name", "tag.alias", "tag.status",
        "tag.created_at", "tag.updated_at", "tag.created_by", "tag.updated_by"
      ]);

      const [items, totalCount] = await qb.getManyAndCount();
      return { items, totalCount };
    }

    const where: any = {};
    if (filters.id) where.id = filters.id;
    where.status = filters.status || TagStatus.PUBLISHED;

    const [items, totalCount] = await this.tagRepository.findAndCount({
      where,
      order: { created_at: "DESC" },
      take: limit,
      skip: offset,
      select: [
        "id", "name", "alias", "status",
        "created_at", "updated_at", "created_by", "updated_by"
      ],
    });
    return { items, totalCount };
  }

  /**
   * Helper to handle list errors
   */
  private handleListError(
    error: any,
    apiId: string,
    response: Response
  ): Response {
    const msg = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
    LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR}`, msg, apiId);
    return APIResponse.error(
      response,
      apiId,
      API_RESPONSES.INTERNAL_SERVER_ERROR,
      msg,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
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
          "id",
          "name",
          "alias",
          "status",
          "created_at",
          "updated_at",
          "created_by",
          "updated_by",
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
    let alias = StringUtil.normalizeKey(name);

    if (!alias) {
      alias = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    }

    // Step 2: Optimized uniqueness check using prefix search
    // This uses the index on 'alias' for efficiency
    const existingAliases = await this.tagRepository.find({
      where: {
        alias: Like(`${alias}%`),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
      select: ["alias"],
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

  private isValidUUID(id: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private async checkNameConflict(name: string): Promise<boolean> {
    const conflict = await this.tagRepository.findOne({
      where: { name, status: TagStatus.PUBLISHED },
      select: ["id"],
    });
    return !!conflict;
  }

  private async checkAliasConflict(alias: string): Promise<boolean> {
    const conflict = await this.tagRepository.findOne({
      where: { alias },
      select: ["id"],
    });
    return !!conflict;
  }
}
