import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, Like, ILike, Not } from 'typeorm';
import * as crypto from 'crypto';
import { CacheService } from 'src/cache/cache.service';
import { Pathway } from './entities/pathway.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreatePathwayDto } from './dto/create-pathway.dto';
import { UpdatePathwayDto } from './dto/update-pathway.dto';
import { ListPathwayDto } from './dto/list-pathway.dto';
import { UpdateOrderDto, BulkUpdateOrderDto } from './dto/update-pathway-order.dto';
import { StringUtil } from '../common/utils/string.util';
import { MAX_PAGINATION_LIMIT } from '../common/dto/pagination.dto';
import { AssignPathwayDto } from './dto/assign-pathway.dto';
import { UserPathwayHistory } from './entities/user-pathway-history.entity';
import { User } from '../../user/entities/user-entity';
import { LmsClientService } from '../common/services/lms-client.service';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class PathwaysService {
  private readonly logger = new Logger(PathwaysService.name);
  constructor(
    @InjectRepository(Pathway)
    private readonly pathwayRepository: Repository<Pathway>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(UserPathwayHistory)
    private readonly userPathwayHistoryRepository: Repository<UserPathwayHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly lmsClientService: LmsClientService,
    private readonly cacheService: CacheService
  ) { }

  /**
   * Validate tag IDs exist in tags table
   * Optimized: Single batch query to check all tag IDs at once
   * Returns invalid tag IDs if any are found
   */
  private async validateTagIds(
    tagIds: string[]
  ): Promise<{ isValid: boolean; invalidTagIds: string[] }> {
    if (!tagIds || tagIds.length === 0) {
      return { isValid: true, invalidTagIds: [] }; // Empty array is valid
    }

    // Remove duplicates
    const uniqueTagIds = [...new Set(tagIds)];

    // OPTIMIZED: Single query to check all tag IDs at once (no N+1)
    const existingTags = await this.tagRepository.find({
      where: { id: In(uniqueTagIds) },
      select: ['id'],
    });

    // OPTIMIZED: Use Set for O(1) lookup instead of O(n) array.includes()
    const existingTagIds = new Set(existingTags.map((tag) => tag.id));
    const invalidTagIds = uniqueTagIds.filter((id) => !existingTagIds.has(id));

    return {
      isValid: invalidTagIds.length === 0,
      invalidTagIds: invalidTagIds,
    };
  }

  /**
   * Fetch tag details for given tag IDs
   * Optimized: Single batch query to fetch all tags at once (no N+1)
   */
  private async fetchTagDetails(
    tagIds: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    // Remove duplicates and filter out null/undefined
    const uniqueTagIds = [...new Set(tagIds.filter(Boolean))];

    if (uniqueTagIds.length === 0) {
      return [];
    }

    // OPTIMIZED: Single query to fetch all tag details at once (no N+1)
    const tags = await this.tagRepository.find({
      where: { id: In(uniqueTagIds) },
      select: ['id', 'name', 'alias'],
    });

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      alias: tag.alias,
    }));
  }

  /**
   * Internal validation for pathway creation
   * Checks for name and key uniqueness and validates tags
   */
  private async validatePathwayCreation(
    createPathwayDto: CreatePathwayDto,
    key: string,
    apiId: string,
    response: Response
  ): Promise<{ isValid: boolean; errorResponse?: Response }> {
    // 1. Check if an active pathway with same name (case-insensitive) already exists
    const activePathwayWithName = await this.pathwayRepository.findOne({
      where: {
        name: ILike(createPathwayDto.name),
        is_active: true,
      },
      select: ['id'],
    });

    if (activePathwayWithName) {
      return {
        isValid: false,
        errorResponse: APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          "An active pathway with this name already exists",
          HttpStatus.CONFLICT
        )
      };
    }

    // 2. Check if pathway with same key already exists
    const existingPathway = await this.pathwayRepository.findOne({
      where: { key },
      select: ['id', 'key'],
    });

    if (existingPathway) {
      return {
        isValid: false,
        errorResponse: APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.PATHWAY_KEY_EXISTS,
          HttpStatus.CONFLICT
        )
      };
    }

    // 3. Validate tags if provided
    const dto = createPathwayDto as any;
    if (dto.tags && dto.tags.length > 0) {
      const validation = await this.validateTagIds(dto.tags);
      if (!validation.isValid) {
        return {
          isValid: false,
          errorResponse: APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `${API_RESPONSES.INVALID_TAG_IDS}: ${validation.invalidTagIds.join(', ')} `,
            HttpStatus.BAD_REQUEST
          )
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Internal logic to calculate a unique display order
   * Falls back to auto-increment if provided order is a duplicate
   */
  private async calculateDisplayOrder(requestedOrder?: number): Promise<number> {
    let displayOrder = requestedOrder;
    let needsAutoGeneration = displayOrder === undefined || displayOrder === null;

    if (!needsAutoGeneration) {
      // Check if forcefully provided order is already taken
      const existingWithOrder = await this.pathwayRepository.findOne({
        where: { display_order: displayOrder },
        select: ['id'],
      });
      if (existingWithOrder) {
        needsAutoGeneration = true;
      }
    }

    if (needsAutoGeneration) {
      const maxOrderResult = await this.pathwayRepository
        .createQueryBuilder('pathway')
        .select('MAX(pathway.display_order)', 'max')
        .getRawOne();

      const maxOrder = maxOrderResult?.max || 0;
      displayOrder = Number(maxOrder) + 1;
    }

    return displayOrder;
  }

  /**
   * Create a new pathway
   * Optimized: Single query with conflict check and batch tag validation
   */
  async create(
    createPathwayDto: CreatePathwayDto,
    userId: string | null,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_CREATE;
    try {
      // Auto-generate key from name if not provided
      const key = createPathwayDto.key || await this.generateUniqueKey(createPathwayDto.name);

      // Perform all validations
      const validation = await this.validatePathwayCreation(createPathwayDto, key, apiId, response);
      if (!validation.isValid) {
        return validation.errorResponse;
      }

      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      let savedPathway;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          // Calculate safe display order (auto-increment on duplicate)
          // Inside the loop so it can pick up new MAX if a previous attempt collided
          const displayOrder = await this.calculateDisplayOrder(createPathwayDto.display_order);

          // Prepare data for save
          const pathwayData = {
            ...createPathwayDto,
            key,
            display_order: displayOrder,
            is_active: createPathwayDto.is_active ?? true,
            tags: (createPathwayDto as any).tags || [],
            created_by: userId,
            updated_by: userId,
          };

          savedPathway = await this.pathwayRepository.save(this.pathwayRepository.create(pathwayData));
          break; // Success!
        } catch (error) {
          // Handle unique constraint violation for display_order specifically
          const isDisplayOrderConflict = error.code === '23505' && error.detail?.includes('display_order');

          if (isDisplayOrderConflict && attempts < MAX_ATTEMPTS) {
            LoggerUtil.warn(
              `Display order collision detected(attempt ${attempts}).Retrying...`,
              apiId
            );
            continue; // Retry with fresh calculation
          }
          throw error; // Rethrow to be handled by outer catch (key conflict or actual error)
        }
      }

      const tagDetails = await this.fetchTagDetails(savedPathway.tags || []);

      // Invalidate pathway search cache
      try {
        await this.cacheService.delByPattern('pathway:search:*');
        LoggerUtil.log('Invalidated pathway search cache after creation', apiId);
      } catch (cacheError) {
        LoggerUtil.warn(`Failed to invalidate pathway search cache: ${cacheError.message}`, apiId);
      }

      const result = {
        id: savedPathway.id,
        key: savedPathway.key,
        name: savedPathway.name,
        description: savedPathway.description,
        tags: tagDetails,
        display_order: savedPathway.display_order,
        is_active: savedPathway.is_active,
        created_at: savedPathway.created_at,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.PATHWAY_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        LoggerUtil.error(
          `${API_RESPONSES.CONFLICT} `,
          `Conflict error details: ${error.detail} `,
          apiId
        );
        // PostgreSQL unique constraint violation
        // Check if it's the display_order or the key
        const detail = error.detail || '';
        if (detail.includes('display_order')) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            "A pathway with this display order already exists. Please try again or use auto-increment.",
            HttpStatus.CONFLICT
          );
        }

        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.PATHWAY_KEY_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error creating pathway: ${errorMessage} `,
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
   * List pathways with optional filter and pagination
   * Optimized: Single query with findAndCount for efficient pagination
   * Includes video and resource counts from LMS service
   */
  async list(
    listPathwayDto: ListPathwayDto,
    tenantId: string,
    organisationId: string,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_LIST;
    try {
      // 1. Generate cache key from all relevant parameters
      const cacheKey = `pathway:search:${crypto
        .createHash('md5')
        .update(JSON.stringify(listPathwayDto, Object.keys(listPathwayDto).sort()))
        .digest('hex')}`;

      // 2. Check cache for DB data only (LMS counts are always fetched live)
      let dbItems: any[] = null;
      let totalCount: number = null;
      let limit: number;
      let offset: number;

      const cachedDb = await this.cacheService.get<any>(cacheKey);
      if (cachedDb) {
        LoggerUtil.log(`Cache HIT for pathway search (DB): ${cacheKey}`, apiId);
        dbItems = cachedDb.items;
        totalCount = cachedDb.totalCount;
        limit = cachedDb.limit;
        offset = cachedDb.offset;
      } else {
        LoggerUtil.log(`Cache MISS for pathway search: ${cacheKey}`, apiId);

        // Set pagination defaults with safeguard to prevent unbounded queries
        // Defense in depth: cap limit even if validation is bypassed
        const requestedLimit = listPathwayDto.limit ?? 10;
        limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
        offset = listPathwayDto.offset ?? 0;

        // Extract filters from nested object
        const filters = listPathwayDto.filters || {};

        // Check if we need QueryBuilder for text search (name or description)
        const needsTextSearch = !!(filters.name || filters.description);
        let rawItems: any[];

        if (needsTextSearch) {
          // Use QueryBuilder for ILIKE queries (optimized for text search)
          const queryBuilder = this.pathwayRepository.createQueryBuilder("pathway");

          // Apply filters
          if (filters.id) {
            queryBuilder.andWhere("pathway.id = :id", { id: filters.id });
          }
          if (filters.name) {
            queryBuilder.andWhere("pathway.name ILIKE :name", { name: `% ${filters.name}% ` });
          }
          if (filters.description) {
            queryBuilder.andWhere("pathway.description ILIKE :description", { description: `% ${filters.description}% ` });
          }
          if (filters.isActive !== undefined) {
            queryBuilder.andWhere("pathway.is_active = :isActive", { isActive: filters.isActive });
          }

          // Apply ordering
          queryBuilder.orderBy("pathway.display_order", "ASC");
          queryBuilder.addOrderBy("pathway.created_at", "DESC");

          // Apply pagination
          queryBuilder.skip(offset).take(limit);

          // Execute query
          [rawItems, totalCount] = await queryBuilder.getManyAndCount();
        } else {
          // Use findAndCount for simple filters (more efficient when no text search)
          const whereCondition: any = {};
          const filters = listPathwayDto.filters || {};
          if (filters.id) {
            whereCondition.id = filters.id;
          }
          if (filters.isActive !== undefined) {
            whereCondition.is_active = filters.isActive;
          }

          // OPTIMIZED: Single query with count and data using findAndCount
          [rawItems, totalCount] = await this.pathwayRepository.findAndCount({
            where: whereCondition,
            order: {
              display_order: "ASC",
              created_at: "DESC",
            },
            take: limit,
            skip: offset,
          });
        }

        // OPTIMIZED: Collect all unique tag IDs from all pathways in one pass
        const allTagIds = new Set<string>();
        rawItems.forEach((item: any) => {
          if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach((tagId: string) => {
              if (tagId) allTagIds.add(tagId);
            });
          }
        });

        // OPTIMIZED: Fetch all tag details in a single batch query (no N+1)
        const tagDetailsMap = new Map<string, { id: string; name: string }>();
        if (allTagIds.size > 0) {
          const tagDetails = await this.fetchTagDetails(Array.from(allTagIds));
          tagDetails.forEach((tag) => {
            tagDetailsMap.set(tag.id, tag);
          });
        }

        // Build DB items with tags resolved (no LMS counts yet)
        dbItems = rawItems.map((item: any) => {
          const tagIds = item.tags || [];
          const tags = tagIds
            .map((tagId: string) => tagDetailsMap.get(tagId))
            .filter((tag) => tag !== undefined);

          return {
            id: item.id,
            key: item.key,
            name: item.name,
            description: item.description,
            tags: tags,
            display_order: item.display_order,
            is_active: item.is_active,
            created_at: item.created_at,
          };
        });

        // Cache only DB data (tags resolved, no LMS counts) for 300 seconds
        await this.cacheService.set(cacheKey, { items: dbItems, totalCount, limit, offset }, 300);
        LoggerUtil.log(`Cached DB pathway data for key: ${cacheKey}`, apiId);
      }

      // Always fetch LMS counts live (never cached) for fresh video/resource counts
      const pathwayIds = dbItems.map((item: any) => item.id);
      const countsMap = await this.lmsClientService.getBatchCounts(
        pathwayIds,
        tenantId,
        organisationId
      );

      // Merge live LMS counts into cached DB items
      const transformedItems = dbItems.map((item: any) => {
        const counts = countsMap.get(item.id);
        return {
          ...item,
          video_count: counts?.videoCount ?? 0,
          resource_count: counts?.resourceCount ?? 0,
          total_items: (counts as any)?.totalItems ?? 0,
        };
      });

      // Return paginated result with count
      const result = {
        count: dbItems.length,
        totalCount: totalCount,
        limit: limit,
        offset: offset,
        items: transformedItems,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_LIST_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error listing pathways: ${errorMessage} `,
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
   * Get pathway by ID
   * Optimized: Single query with proper error handling
   */
  async findOne(id: string, response: Response): Promise<Response> {
    const apiId = APIID.PATHWAY_GET;
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

      // Single query to fetch pathway
      const pathway = await this.pathwayRepository.findOne({
        where: { id },
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.PATHWAY_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // OPTIMIZED: Fetch tag details in a single batch query (no N+1)
      const pathwayData = pathway as any;
      const tagIds = pathwayData.tags || [];
      const tagDetails = await this.fetchTagDetails(tagIds);

      // Transform to return only tags with names (no tag_ids)
      const result = {
        id: pathwayData.id,
        key: pathwayData.key,
        name: pathwayData.name,
        description: pathwayData.description,
        tags: tagDetails,
        display_order: pathwayData.display_order,
        is_active: pathwayData.is_active,
        created_at: pathwayData.created_at,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_GET_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error fetching pathway: ${errorMessage} `,
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
   * Update pathway by ID
   * Optimized: Use repository.update() for partial updates instead of findOne + save
   */
  async update(
    id: string,
    updatePathwayDto: UpdatePathwayDto,
    userId: string | null,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_UPDATE;
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

      // Check if pathway exists
      const existingPathway = await this.pathwayRepository.findOne({
        where: { id },
        select: ['id'],
      });

      if (!existingPathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.PATHWAY_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // Validate tags if provided in update
      const updateDto = updatePathwayDto as any;
      // Guard against tags: null to avoid runtime errors
      if (updateDto.tags !== undefined && updateDto.tags !== null) {
        // Handle both empty array and array with values
        if (Array.isArray(updateDto.tags) && updateDto.tags.length > 0) {
          const validation = await this.validateTagIds(updateDto.tags);
          if (!validation.isValid) {
            return APIResponse.error(
              response,
              apiId,
              API_RESPONSES.BAD_REQUEST,
              `${API_RESPONSES.INVALID_TAG_IDS
              }: ${validation.invalidTagIds.join(', ')} `,
              HttpStatus.BAD_REQUEST
            );
          }
        }
      }

      // Prepare update data - filter out undefined values and map tags correctly
      // TypeORM update() doesn't handle undefined values, so we need to filter them
      // Tags stored as PostgreSQL text[] array: {tag_id1,tag_id2}
      const updateData: any = {};

      if (updatePathwayDto.name !== undefined) {
        // Check if an active pathway with same name (case-insensitive) already exists, excluding current pathway
        const activePathwayWithName = await this.pathwayRepository.findOne({
          where: {
            name: ILike(updatePathwayDto.name),
            is_active: true,
            id: Not(id),
          },
          select: ['id'],
        });

        if (activePathwayWithName) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            "An active pathway with this name already exists",
            HttpStatus.CONFLICT
          );
        }
        updateData.name = updatePathwayDto.name;
      }
      if (updatePathwayDto.description !== undefined) {
        updateData.description = updatePathwayDto.description;
      }
      // Guard against null: only update if tags is explicitly provided (array or empty array)
      if (updateDto.tags !== undefined && updateDto.tags !== null) {
        // Store as PostgreSQL text[] array
        // Empty array is valid, so we allow it
        updateData.tags = Array.isArray(updateDto.tags) ? updateDto.tags : [];
      }
      if (updatePathwayDto.display_order !== undefined) {
        updateData.display_order = updatePathwayDto.display_order;
      }
      if (updatePathwayDto.is_active !== undefined) {
        updateData.is_active = updatePathwayDto.is_active;
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
      // This is more efficient than findOne + save as it performs a direct UPDATE query
      // updated_at is automatically updated by UpdateDateColumn decorator
      const updateResult = await this.pathwayRepository.update(
        { id },
        updateData
      );

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          'Failed to update pathway',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      // Invalidate pathway search cache
      try {
        await this.cacheService.delByPattern('pathway:search:*');
        LoggerUtil.log('Invalidated pathway search cache after update', apiId);
      } catch (cacheError) {
        LoggerUtil.warn(`Failed to invalidate pathway search cache: ${cacheError.message}`, apiId);
      }

      // Fetch updated pathway for response
      const updatedPathway = await this.pathwayRepository.findOne({
        where: { id },
      });

      if (!updatedPathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.PATHWAY_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // OPTIMIZED: Fetch tag details in a single batch query (no N+1)
      const pathwayData = updatedPathway as any;
      const tagIds = pathwayData.tags || [];
      const tagDetails = await this.fetchTagDetails(tagIds);

      // Transform to return tags (id and name) instead of tag_ids
      const result = {
        id: pathwayData.id,
        key: pathwayData.key,
        name: pathwayData.name,
        description: pathwayData.description,
        tags: tagDetails,
        display_order: pathwayData.display_order,
        is_active: pathwayData.is_active,
        created_at: pathwayData.created_at,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error updating pathway: ${errorMessage} `,
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
   * Assign / Activate Pathway for User
   * Logic: Deactivate existing active pathway and reactivate or create new record
   */
  async assignPathway(
    assignDto: AssignPathwayDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_ASSIGN;
    return this.handlePathwayAssignment(
      assignDto.userId,
      assignDto.pathwayId,
      apiId,
      response,
      assignDto.userGoal,
      assignDto.created_by,
      assignDto.updated_by
    );
  }



  /**
   * Shared internal method for Pathway Assignment and Switching
   * Ensures strict reactivation of existing records to prevent duplicates
   */
  private async handlePathwayAssignment(
    userId: string,
    pathwayId: string,
    apiId: string,
    response: Response,
    userGoal?: string,
    created_by?: string,
    updated_by?: string
  ): Promise<Response> {
    try {
      // 1. Validate user existence
      const user = await this.userRepository.findOne({
        where: { userId },
        select: ['userId'],
      });

      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          'User not found',
          HttpStatus.NOT_FOUND
        );
      }

      // 2. Validate target pathway existence and active status
      const pathway = await this.pathwayRepository.findOne({
        where: { id: pathwayId, is_active: true },
        select: ['id'],
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          'Active pathway not found',
          HttpStatus.NOT_FOUND
        );
      }

      // 3. Find currently active pathway
      const currentActive = await this.userPathwayHistoryRepository.findOne({
        where: { user_id: userId, is_active: true },
      });

      // 4. Check if target pathway already has a history record for this user
      // If found, we will REACTIVATE it instead of creating a new one
      const existingTargetRecord = await this.userPathwayHistoryRepository.findOne({
        where: { user_id: userId, pathway_id: pathwayId },
      });

      // If already active, no switch needed
      if (currentActive?.pathway_id === pathwayId) {
        const result = {
          userId,
          previousPathwayId: pathwayId,
          currentPathwayId: pathwayId,
          activatedAt: currentActive.activated_at,
          deactivated_at: null,
          userGoal: currentActive.user_goal,
          created_by: currentActive.created_by,
          updated_by: currentActive.updated_by,
        };
        return APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.OK,
          'Pathway is already active'
        );
      }

      const timestamp = new Date();
      let previousPathwayId = currentActive ? currentActive.pathway_id : null;

      // 5. Atomic Transaction: Deactivate current and Reactivate/Activate target
      await this.dataSource.transaction(async (manager) => {
        // Deactivate current active pathway
        if (currentActive) {
          await manager.update(
            UserPathwayHistory,
            { id: currentActive.id },
            {
              is_active: false,
              deactivated_at: timestamp,
              updated_by: updated_by || created_by
            }
          );
        }

        if (existingTargetRecord) {
          // REACTIVATE: Update existing record timestamps and status
          // This keeps the interests linked to this record ID safe
          await manager.update(
            UserPathwayHistory,
            { id: existingTargetRecord.id },
            {
              is_active: true,
              activated_at: timestamp,
              deactivated_at: null, // As requested: if reactivated, null the column
              user_goal: userGoal,
              updated_by: null // Refined: null when deactivated_at is null
            }
          );
        } else {
          // CREATE: New history record
          const record = manager.create(UserPathwayHistory, {
            user_id: userId,
            pathway_id: pathwayId,
            is_active: true,
            activated_at: timestamp,
            user_goal: userGoal,
            created_by: created_by,
            updated_by: null // Refined: null on initial creation
          });
          await manager.save(record);
        }
      });

      const result = {
        userId,
        previousPathwayId,
        currentPathwayId: pathwayId,
        activatedAt: timestamp,
        deactivated_at: currentActive ? timestamp : null,
        userGoal: userGoal,
        created_by: created_by,
        updated_by: null, // Refined: result is the active record, so updated_by is null
      };

      const successMessage = currentActive
        ? API_RESPONSES.PATHWAY_SWITCHED_SUCCESSFULLY
        : API_RESPONSES.PATHWAY_ASSIGNED_SUCCESSFULLY;

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        successMessage
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error handling pathway assignment: ${errorMessage} `,
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
   * Get Active Pathway for User
   * Retrieves the currently active pathway assignment for a user
   */
  async getActivePathway(
    userId: string,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_GET_ACTIVE;
    try {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

      // 1. Validate user existence
      const user = await this.userRepository.findOne({
        where: { userId },
        select: ['userId'],
      });

      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          'User not found',
          HttpStatus.NOT_FOUND
        );
      }

      // 2. Get active pathway from user_pathway_history
      const activePathway = await this.userPathwayHistoryRepository.findOne({
        where: { user_id: userId, is_active: true },
        select: ['id', 'pathway_id', 'activated_at', 'user_goal'],
      });

      if (!activePathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          'No active pathway found for this user',
          HttpStatus.NOT_FOUND
        );
      }

      const result = {
        id: activePathway.id,
        pathwayId: activePathway.pathway_id,
        activatedAt: activePathway.activated_at,
        userGoal: activePathway.user_goal,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        'Active pathway retrieved successfully'
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error getting active pathway: ${errorMessage} `,
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
   * Generate a unique key from name for a pathway
   * Logic mirrors TagsService.generateUniqueAlias and InterestsService.generateUniqueKey
   */
  private async generateUniqueKey(name: string): Promise<string> {
    // Step 1: Normalization (Safe truncation handled by utility)
    let key = StringUtil.normalizeKey(name, 50);

    if (!key) {
      // Fallback if name contains no valid chars
      key = `pathway_${Date.now()} `;
    }

    // Step 2: Uniqueness check with prefix search
    const existingKeys = await this.pathwayRepository.find({
      where: {
        key: Like(`${key}% `),
      },
      select: ['key'],
    });

    if (existingKeys.length === 0) {
      return key;
    }

    const keySet = new Set(existingKeys.map((p) => p.key));
    if (!keySet.has(key)) {
      return key;
    }

    // Step 3: Find next available numeric suffix
    let counter = 1;
    let uniqueKey = `${key}_${counter} `;

    // Ensure suffix doesn't exceed length limit
    while (keySet.has(uniqueKey)) {
      counter++;
      const suffix = `_${counter} `;
      if (key.length + suffix.length > 50) {
        // Trim base key to fit suffix
        const trimmedBase = key.substring(0, 50 - suffix.length);
        uniqueKey = `${trimmedBase}${suffix} `;
      } else {
        uniqueKey = `${key}${suffix} `;
      }

      // Safety break
      if (counter > 1000) break;
    }

    return uniqueKey;
  }

  async updateOrderStructure(
    bulkUpdateOrderDto: BulkUpdateOrderDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_ORDER_STRUCTURE;
    try {
      const { orders } = bulkUpdateOrderDto;

      // 1. Validate uniqueness of IDs and Order values in the request itself
      const ids = orders.map(o => o.id);
      const orderValues = orders.map(o => o.order);

      if (new Set(ids).size !== ids.length) {
        return APIResponse.error(response, apiId, API_RESPONSES.BAD_REQUEST, "Duplicate IDs found in request", HttpStatus.BAD_REQUEST);
      }
      if (new Set(orderValues).size !== orderValues.length) {
        return APIResponse.error(response, apiId, API_RESPONSES.BAD_REQUEST, "Duplicate order values found in request", HttpStatus.BAD_REQUEST);
      }

      // 2. Validate that all pathways exist before starting the transaction
      const existingPathways = await this.pathwayRepository.find({
        where: { id: In(ids) },
        select: ['id', 'display_order']
      });

      if (existingPathways.length !== orders.length) {
        const foundIdsSet = new Set(existingPathways.map(p => p.id));
        const missingIds = ids.filter(id => !foundIdsSet.has(id));
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          `One or more pathways not found: ${missingIds.join(', ')} `,
          HttpStatus.NOT_FOUND
        );
      }

      // 3. Prevent collisions with pathways NOT in the request
      // If a user reorders A and B but targets an order held by C (which is not in the request),
      // the unique index will block Step 2. We validate this upfront for a clear error message.
      const potentialConflicts = await this.pathwayRepository.find({
        where: { display_order: In(orderValues) },
        select: ['id', 'name', 'display_order']
      });

      const externalConflicts = potentialConflicts.filter(p => !ids.includes(p.id));

      if (externalConflicts.length > 0) {
        const conflictDetails = externalConflicts.map(p => `'${p.name}'(Order ${p.display_order})`).join(', ');
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          `Reordering failed: The target display orders are currently occupied by other pathways not included in this request: ${conflictDetails}. Please include these pathways in your request to perform a safe swap or shift.`,
          HttpStatus.CONFLICT
        );
      }

      // 4. Use a transaction for safe reordering
      await this.dataSource.transaction(async (transactionalEntityManager) => {
        // Step 1: Temporarily update all targeted display_order values to a non-conflicting negative range
        // We use negation ( -order ) to avoid UniqueConstraintViolation during swapping.
        // This also eliminates the risk of integer overflow that a large positive offset might cause.
        // Since all display orders are >= 1, negated values will be <= -1, ensuring no collision with existing positive values.
        for (const orderItem of orders) {
          // We already validated existence above, so we can proceed safely
          const currentPathway = existingPathways.find(p => p.id === orderItem.id);
          await transactionalEntityManager.update(
            Pathway,
            { id: orderItem.id },
            { display_order: -currentPathway.display_order }
          );
        }

        // Step 2: Apply the final display_order values from the request
        for (const orderItem of orders) {
          await transactionalEntityManager.update(
            Pathway,
            { id: orderItem.id },
            {
              display_order: orderItem.order,
              updated_at: new Date(),
            }
          );
        }
      });

      // Invalidate pathway search cache
      try {
        await this.cacheService.delByPattern('pathway:search:*');
        LoggerUtil.log('Invalidated pathway search cache after reordering', apiId);
      } catch (cacheError) {
        LoggerUtil.warn(`Failed to invalidate pathway search cache: ${cacheError.message}`, apiId);
      }

      return APIResponse.success(
        response,
        apiId,
        null,
        HttpStatus.OK,
        "Pathway order structure updated successfully"
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR} `,
        `Error updating pathway order structure: ${errorMessage} `,
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
