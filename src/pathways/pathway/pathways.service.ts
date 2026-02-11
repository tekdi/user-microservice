import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Pathway } from './entities/pathway.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreatePathwayDto } from './dto/create-pathway.dto';
import { UpdatePathwayDto } from './dto/update-pathway.dto';
import { ListPathwayDto } from './dto/list-pathway.dto';
import { MAX_PAGINATION_LIMIT } from '../common/dto/pagination.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class PathwaysService {
  constructor(
    @InjectRepository(Pathway)
    private readonly pathwayRepository: Repository<Pathway>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>
  ) {}

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
      select: ['id', 'name'],
    });

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
    }));
  }

  /**
   * Create a new pathway
   * Optimized: Single query with conflict check and batch tag validation
   */
  async create(
    createPathwayDto: CreatePathwayDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_CREATE;
    try {
      // Check if pathway with same key already exists
      const existingPathway = await this.pathwayRepository.findOne({
        where: { key: createPathwayDto.key },
        select: ['id', 'key'],
      });

      if (existingPathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.PATHWAY_KEY_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      // Validate tags if provided
      const dto = createPathwayDto as any;
      if (dto.tags && dto.tags.length > 0) {
        const validation = await this.validateTagIds(dto.tags);
        if (!validation.isValid) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            `${API_RESPONSES.INVALID_TAG_IDS}: ${validation.invalidTagIds.join(
              ', '
            )}`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      // Set default is_active if not provided
      // Store tags as PostgreSQL text[] array in database
      // Format: {tag_id1,tag_id2,tag_id3}
      const pathwayData = {
        ...createPathwayDto,
        is_active: createPathwayDto.is_active ?? true,
        tags: dto.tags && dto.tags.length > 0 ? dto.tags : [],
      };

      // Create and save in single operation
      const pathway = this.pathwayRepository.create(pathwayData);
      const savedPathway = await this.pathwayRepository.save(pathway);

      // OPTIMIZED: Fetch tag details in a single batch query (no N+1)
      const savedData = savedPathway as any;
      const tagIds = savedData.tags || [];
      const tagDetails = await this.fetchTagDetails(tagIds);

      // Return all fields with tags (id and name) instead of tag_ids
      const result = {
        id: savedData.id,
        key: savedData.key,
        name: savedData.name,
        description: savedData.description,
        tags: tagDetails,
        display_order: savedData.display_order,
        is_active: savedData.is_active,
        created_at: savedData.created_at,
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
        // PostgreSQL unique constraint violation
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error creating pathway: ${errorMessage}`,
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
   */
  async list(
    listPathwayDto: ListPathwayDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_LIST;
    try {
      // Build where clause conditionally
      const whereCondition: any = {};
      if (listPathwayDto.isActive !== undefined) {
        whereCondition.is_active = listPathwayDto.isActive;
      }

      // Set pagination defaults with safeguard to prevent unbounded queries
      // Defense in depth: cap limit even if validation is bypassed
      const requestedLimit = listPathwayDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listPathwayDto.offset ?? 0;

      // OPTIMIZED: Single query with count and data using findAndCount
      // This performs both COUNT and SELECT in an optimized way
      // Using indexed columns (is_active, display_order) for performance
      const [items, totalCount] = await this.pathwayRepository.findAndCount({
        where: whereCondition,
        order: {
          display_order: 'ASC',
          created_at: 'DESC',
        },
        take: limit,
        skip: offset,
      });

      // OPTIMIZED: Collect all unique tag IDs from all pathways in one pass
      const allTagIds = new Set<string>();
      items.forEach((item: any) => {
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

      // Transform items to include only tags with names (no tag_ids)
      const transformedItems = items.map((item: any) => {
        const tagIds = item.tags || [];
        const tags = tagIds
          .map((tagId: string) => tagDetailsMap.get(tagId))
          .filter((tag) => tag !== undefined); // Filter out any tags that weren't found

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

      // Return paginated result with count
      const result = {
        count: items.length,
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing pathways: ${errorMessage}`,
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error fetching pathway: ${errorMessage}`,
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
              `${API_RESPONSES.INVALID_TAG_IDS}: ${validation.invalidTagIds.join(
                ', '
              )}`,
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error updating pathway: ${errorMessage}`,
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
