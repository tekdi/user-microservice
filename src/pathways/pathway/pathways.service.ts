import * as crypto from 'crypto';
import { Injectable, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, Like, ILike, Not } from 'typeorm';
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
import { S3StorageProvider } from '../../storage/providers/s3-storage.provider';
import { ConfigService } from '@nestjs/config';
import { CacheService } from 'src/cache/cache.service';

@Injectable()
export class PathwaysService {
  private readonly logger = new Logger(PathwaysService.name);
  private readonly s3StorageProvider: S3StorageProvider;

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
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService
  ) {
    // Initialize S3StorageProvider for image uploads
    this.s3StorageProvider = new S3StorageProvider(this.configService);
  }

  /**
   * Normalize path key: trim leading/trailing slashes and collapse consecutive slashes.
   * Uses simple string iteration (O(n)) to avoid any regex and ReDoS risk.
   */
  private normalizePathKey(s: string): string {
    let start = 0;
    while (start < s.length && s[start] === '/') start++;
    let end = s.length;
    while (end > start && s[end - 1] === '/') end--;
    if (start >= end) return '';
    const segment: string[] = [];
    let i = start;
    while (i < end) {
      if (s[i] === '/') {
        segment.push('/');
        while (i < end && s[i] === '/') i++;
      } else {
        const begin = i;
        while (i < end && s[i] !== '/') i++;
        segment.push(s.slice(begin, i));
      }
    }
    return segment.join('');
  }

  /**
   * Sanitized pathway storage key prefix from env (single source of truth for PATHWAY_STORAGE_KEY_PREFIX).
   */
  private getPathwayStoragePrefix(): string {
    const raw = this.configService.get<string>('PATHWAY_STORAGE_KEY_PREFIX') || 'pathway-images/pathway/files';
    return this.normalizePathKey(raw);
  }

  /**
   * Get pathway storage/config (LMS-style). Returns upload path, presigned expiry, image mime types and size limit from env.
   */
  getPathwayConfig(): {
    pathway_upload_path: string;
    presigned_url_expires_in: number;
    image_mime_type: string;
    image_filesize: number;
  } {
    const pathway_upload_path = this.getPathwayStoragePrefix();
    const presigned_url_expires_in = Number.parseInt(
      this.configService.get<string>('AWS_UPLOAD_FILE_EXPIRY') || '3600',
      10
    );
    return {
      pathway_upload_path,
      presigned_url_expires_in,
      image_mime_type: 'image/jpeg, image/jpg, image/png, image/svg+xml',
      image_filesize: 5, // MB, same as pathway image limit
    };
  }

  /**
   * Get presigned URL for pathway image upload. Client sends only the image file name (e.g. file_1771313851464_f195e1.png).
   * Backend builds full S3 key from PATHWAY_STORAGE_KEY_PREFIX env (e.g. pathway-images/pathway/files) + filename.
   * Validates contentType against allowed image MIME types and caps sizeLimit at config max.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
    sizeLimit?: number
  ): Promise<{ url: string; fields: Record<string, string>; fileUrl: string }> {
    const config = this.getPathwayConfig();
    const allowedMimeTypes = config.image_mime_type.split(',').map((s) => s.trim().toLowerCase());
    const contentTypeLower = (contentType || '').trim().toLowerCase();
    if (!allowedMimeTypes.includes(contentTypeLower)) {
      throw new BadRequestException(
        `contentType must be one of: ${config.image_mime_type}. Received: ${contentType || '(empty)'}`
      );
    }
    const maxSizeBytes = config.image_filesize * 1024 * 1024;
    const cappedSizeLimit = sizeLimit == null ? maxSizeBytes : Math.min(sizeLimit, maxSizeBytes);

    const prefix = this.getPathwayStoragePrefix();
    const fileName = (key || '').trim();
    if (!fileName) {
      throw new BadRequestException('Key (file name) is required');
    }
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new BadRequestException('Key must be a file name only (no path or path traversal). Example: file_1771313851464_f195e1.png');
    }
    const fullKey = prefix ? `${prefix}/${fileName}` : fileName;
    const { url, fields } = await this.s3StorageProvider.getPresignedPostForKey(fullKey, contentType, {
      expiresIn,
      sizeLimit: cappedSizeLimit,
    });
    const fileUrl = this.s3StorageProvider.getUrl(fullKey);
    return { url, fields, fileUrl };
  }

  /**
   * Delete a file from pathway S3 storage by URL or key (like LMS DELETE /storage/files?key=...).
   * Key/URL must be under PATHWAY_STORAGE_KEY_PREFIX. Logs the deletion.
   *
   * URL support: Only AWS S3 virtual-hosted-style URLs are supported:
   * https://bucket.s3.region.amazonaws.com/key
   * Path-style URLs (https://s3.region.amazonaws.com/bucket/key) or custom S3-compatible
   * endpoints (e.g. MinIO) may not parse correctly and can cause deletion failures.
   */
  async deletePathwayStorageFile(keyOrUrl: string, response: Response): Promise<Response> {
    const apiId = APIID.PATHWAY_STORAGE_DELETE;
    const prefix = this.getPathwayStoragePrefix();
    const prefixWithSlash = prefix ? `${prefix}/` : '';
    let s3Key: string;
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      const extracted = this.extractS3KeyFromUrl(keyOrUrl);
      if (!extracted) {
        return APIResponse.error(response, apiId, API_RESPONSES.BAD_REQUEST, 'Invalid file URL', HttpStatus.BAD_REQUEST);
      }
      s3Key = extracted;
    } else {
      s3Key = this.normalizePathKey(keyOrUrl);
    }
    if (!prefixWithSlash || !s3Key.startsWith(prefixWithSlash)) {
      return APIResponse.error(response, apiId, API_RESPONSES.BAD_REQUEST, `File key must be a file under pathway storage prefix (${prefix}/), not the prefix itself`, HttpStatus.BAD_REQUEST);
    }
    try {
      await this.s3StorageProvider.delete(s3Key);
      return APIResponse.success(response, apiId, { deleted: true, key: s3Key }, HttpStatus.OK, 'File deleted from storage');
    } catch (error) {
      this.logger.warn(`Pathway storage delete failed: key=${s3Key}, error=${error instanceof Error ? error.message : 'Unknown'}`);
      return APIResponse.error(response, apiId, API_RESPONSES.INTERNAL_SERVER_ERROR, 'Failed to delete file from storage', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Extract S3 object key from a virtual-hosted-style S3 URL.
   * Supported format: https://bucket.s3.region.amazonaws.com/key (pathname is the key).
   * Path-style or custom S3-compatible endpoints are not supported.
   */
  private extractS3KeyFromUrl(url: string): string | null {
    if (!url) {
      return null;
    }

    try {
      const urlObj = new URL(url);
      // Remove leading slash from pathname
      const key = urlObj.pathname.replace(/^\//, '');
      return key || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract S3 key from URL: ${url}. ${message}`);
      return null;
    }
  }

  /**
   * Delete image from S3 if URL exists
   */
  private async deleteImageFromS3(imageUrl: string | null): Promise<void> {
    if (!imageUrl) {
      return;
    }

    try {
      const s3Key = this.extractS3KeyFromUrl(imageUrl);
      if (s3Key) {
        await this.s3StorageProvider.delete(s3Key);
      }
    } catch (error) {
      // Log error but don't fail the request if deletion fails
      this.logger.warn(`Failed to delete image from S3: ${imageUrl}, error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

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
      let key = createPathwayDto.key;
      if (!key) {
        key = await this.generateUniqueKey(createPathwayDto.name);
      }

      // Check if an active pathway with same name (case-insensitive) already exists
      const activePathwayWithName = await this.pathwayRepository.findOne({
        where: {
          name: ILike(createPathwayDto.name),
          is_active: true,
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
      // Check if pathway with same key already exists
      const existingPathway = await this.pathwayRepository.findOne({
        where: { key },
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
      if (createPathwayDto.tags && createPathwayDto.tags.length > 0) {
        const validation = await this.validateTagIds(createPathwayDto.tags);
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

      // Handle auto-increment for display_order if not provided
      let displayOrder = createPathwayDto.display_order;
      if (displayOrder === undefined || displayOrder === null) {
        const maxOrderResult = await this.pathwayRepository
          .createQueryBuilder('pathway')
          .select('MAX(pathway.display_order)', 'max')
          .getRawOne();

        const maxOrder = maxOrderResult?.max || 0;
        displayOrder = Number(maxOrder) + 1;
      }
      let imageUrl: string | null = null;
      const dtoImageUrl = createPathwayDto.image_url;
      if (dtoImageUrl && typeof dtoImageUrl === 'string' && dtoImageUrl.trim() !== '') {
        imageUrl = dtoImageUrl.trim();
      }

      const pathwayData = {
        ...createPathwayDto,
        key: key,
        display_order: displayOrder,
        is_active: createPathwayDto.is_active ?? true,
        tags: createPathwayDto.tags && createPathwayDto.tags.length > 0 ? createPathwayDto.tags : [],
        image_url: imageUrl,
        created_by: userId,
        updated_by: userId,
      };

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
        image_url: savedData.image_url,
        created_at: savedData.created_at,
      };

      // Invalidate pathway list cache after successful creation
      try {
        await this.cacheService.delByPattern('pathway:list:*');
        this.logger.debug('Invalidated pathway list cache after creation');
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to invalidate pathway list cache: ${cacheError?.message || cacheError}`
        );
      }

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
   * Generate a stable cache key for pathway list (tenantId + organisationId + normalized list params).
   */
  private generatePathwayListCacheKey(
    tenantId: string,
    organisationId: string,
    listPathwayDto: ListPathwayDto
  ): string {
    const requestedLimit = listPathwayDto.limit ?? 10;
    const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
    const offset = listPathwayDto.offset ?? 0;
    const filters = (listPathwayDto as any).filters || {};
    const cacheKeyObject = {
      tenantId,
      organisationId,
      filters: Object.keys(filters).sort().reduce((acc: any, k) => {
        acc[k] = (filters as any)[k];
        return acc;
      }, {}),
      limit,
      offset,
    };
    const sortedKeys = Object.keys(cacheKeyObject).sort();
    const sortedObject: any = {};
    for (const key of sortedKeys) {
      sortedObject[key] = cacheKeyObject[key as keyof typeof cacheKeyObject];
    }
    const keyString = JSON.stringify(sortedObject);
    const hash = crypto.createHash('sha256').update(keyString).digest('hex');
    return `pathway:list:${hash}`;
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
    const pathwayListCacheTtl = parseInt(
      this.configService.get('PATHWAY_LIST_CACHE_TTL_SECONDS') || '1800',
      10
    );
    try {
      const cacheKey = this.generatePathwayListCacheKey(tenantId, organisationId, listPathwayDto);
      let cachedResult: { count: number; limit: number; offset: number; items: any[] } | null = null;
      try {
        cachedResult = await this.cacheService.get<{ count: number; limit: number; offset: number; items: any[] }>(cacheKey);
      } catch (cacheReadError: any) {
        this.logger.warn(
          `Pathway list cache read failed, falling through to DB: ${cacheReadError?.message || cacheReadError}`
        );
      }
      if (cachedResult) {
        this.logger.debug(`Cache HIT for pathway list: ${cacheKey}`);
        // Cached items store tag_ids only; resolve tag names on hit so renames/archives are fresh
        const allTagIds = new Set<string>();
        (cachedResult.items || []).forEach((item: any) => {
          const ids = item.tag_ids ?? (item.tags || []).map((t: any) => t?.id ?? t);
          ids.forEach((tagId: string) => {
            if (tagId) allTagIds.add(tagId);
          });
        });
        const tagDetailsMap = new Map<string, { id: string; name: string }>();
        if (allTagIds.size > 0) {
          const tagDetails = await this.fetchTagDetails(Array.from(allTagIds));
          tagDetails.forEach((tag) => tagDetailsMap.set(tag.id, tag));
        }
        // Cached items do not include video_count, resource_count, total_items; fetch from LMS
        const pathwayIds = (cachedResult.items || [])
          .filter((item: any) => item?.id != null && typeof item.id === 'string')
          .map((item: any) => item.id);
        const MAX_BATCH_SIZE = 100;
        const countsMap = new Map<string, { videoCount: number; resourceCount: number; totalItems: number }>();
        for (let i = 0; i < pathwayIds.length; i += MAX_BATCH_SIZE) {
          const chunk = pathwayIds.slice(i, i + MAX_BATCH_SIZE);
          const chunkMap = await this.lmsClientService.getBatchCounts(
            chunk,
            tenantId,
            organisationId
          );
          chunkMap.forEach((counts, id) => countsMap.set(id, counts));
        }
        const itemsWithCountsAndTags = cachedResult.items.map((item: any) => {
          const counts = countsMap.get(item.id);
          const tagIds = item.tag_ids ?? (item.tags || []).map((t: any) => t?.id ?? t);
          const tags = tagIds
            .map((tagId: string) => tagDetailsMap.get(tagId))
            .filter((t) => t !== undefined);
          return {
            id: item.id,
            key: item.key,
            name: item.name,
            description: item.description,
            tags,
            display_order: item.display_order,
            is_active: item.is_active,
            image_url: item.image_url,
            created_at: item.created_at,
            video_count: counts?.videoCount ?? 0,
            resource_count: counts?.resourceCount ?? 0,
            total_items: (counts as any)?.totalItems ?? 0,
          };
        });
        const resultFromCache = {
          count: cachedResult.count,
          limit: cachedResult.limit,
          offset: cachedResult.offset,
          items: itemsWithCountsAndTags,
        };
        return APIResponse.success(
          response,
          apiId,
          resultFromCache,
          HttpStatus.OK,
          API_RESPONSES.PATHWAY_LIST_SUCCESS
        );
      }
      this.logger.debug(`Cache MISS for pathway list: ${cacheKey}`);

      // Set pagination defaults with safeguard to prevent unbounded queries
      // Defense in depth: cap limit even if validation is bypassed
      const requestedLimit = listPathwayDto.limit ?? 10;
      const limit = Math.min(requestedLimit, MAX_PAGINATION_LIMIT);
      const offset = listPathwayDto.offset ?? 0;

      // Extract filters from nested object
      const filters = (listPathwayDto as any).filters || {};

      // Check if we need QueryBuilder for text search (name or description)
      const needsTextSearch = !!(filters.name || filters.description);
      let items: any[];
      let totalCount: number;

      if (needsTextSearch) {
        // Use QueryBuilder for ILIKE queries (optimized for text search)
        const queryBuilder = this.pathwayRepository.createQueryBuilder("pathway");

        // Apply filters
        if (filters.id) {
          queryBuilder.andWhere("pathway.id = :id", { id: filters.id });
        }
        if (filters.name) {
          queryBuilder.andWhere("pathway.name ILIKE :name", { name: `%${filters.name}%` });
        }
        if (filters.description) {
          queryBuilder.andWhere("pathway.description ILIKE :description", { description: `%${filters.description}%` });
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
        [items, totalCount] = await queryBuilder.getManyAndCount();
      } else {
        // Use findAndCount for simple filters (more efficient when no text search)
        const whereCondition: any = {};
        if (filters.id) {
          whereCondition.id = filters.id;
        }
        if (filters.isActive !== undefined) {
          whereCondition.is_active = filters.isActive;
        }

        // OPTIMIZED: Single query with count and data using findAndCount
        // This performs both COUNT and SELECT in an optimized way
        // Using indexed columns (is_active, display_order) for performance
        [items, totalCount] = await this.pathwayRepository.findAndCount({
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

      // OPTIMIZED: Batch fetch video and resource counts for all pathways
      // SAFETY: Validate items array and extract IDs safely
      const pathwayIds = items
        .filter((item: any) => item?.id != null && typeof item.id === 'string')
        .map((item: any) => item.id);

      const MAX_BATCH_SIZE = 100;
      const countsMap = new Map<string, { videoCount: number; resourceCount: number; totalItems: number }>();
      for (let i = 0; i < pathwayIds.length; i += MAX_BATCH_SIZE) {
        const chunk = pathwayIds.slice(i, i + MAX_BATCH_SIZE);
        const chunkMap = await this.lmsClientService.getBatchCounts(
          chunk,
          tenantId,
          organisationId
        );
        chunkMap.forEach((counts, id) => countsMap.set(id, counts));
      }

      // Transform items to include only tags with names (no tag_ids) and counts
      const transformedItems = items.map((item: any) => {
        const tagIds = item.tags || [];
        const tags = tagIds
          .map((tagId: string) => tagDetailsMap.get(tagId))
          .filter((tag) => tag !== undefined); // Filter out any tags that weren't found

        const counts = countsMap.get(item.id);
        const videoCount = counts?.videoCount ?? 0;
        const resourceCount = counts?.resourceCount ?? 0;
        const totalItems = (counts as any)?.totalItems ?? 0;

        return {
          id: item.id,
          key: item.key,
          name: item.name,
          description: item.description,
          tags: tags,
          display_order: item.display_order,
          is_active: item.is_active,
          image_url: item.image_url,
          created_at: item.created_at,
          video_count: videoCount,
          resource_count: resourceCount,
          total_items: totalItems,
        };
      });

      // Return paginated result; count = total count of records (for pagination)
      const result = {
        count: totalCount,
        limit: limit,
        offset: offset,
        items: transformedItems,
      };

      // Cache list response: tag_ids only (resolve names on hit to avoid stale tag data), no video/resource counts
      try {
        const resultForCache = {
          count: totalCount,
          limit: limit,
          offset: offset,
          items: transformedItems.map(({ video_count, resource_count, total_items, tags, ...item }) => ({
            ...item,
            tag_ids: (tags || []).map((t: { id: string }) => t.id),
          })),
        };
        await this.cacheService.set(cacheKey, resultForCache, pathwayListCacheTtl);
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to cache pathway list result: ${cacheError?.message || cacheError}`
        );
      }

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

      // Transform to return tags and image_url (S3 link)
      const result = {
        id: pathwayData.id,
        key: pathwayData.key,
        name: pathwayData.name,
        description: pathwayData.description,
        tags: tagDetails,
        display_order: pathwayData.display_order,
        is_active: pathwayData.is_active,
        image_url: pathwayData.image_url,
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

      // Check if pathway exists and get existing image_url for deletion
      const existingPathway = await this.pathwayRepository.findOne({
        where: { id },
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

      const oldImageUrl = existingPathway.image_url;

      // Validate tags if provided in update
      if (updatePathwayDto.tags !== undefined && updatePathwayDto.tags !== null) {
        if (Array.isArray(updatePathwayDto.tags) && updatePathwayDto.tags.length > 0) {
          const validation = await this.validateTagIds(updatePathwayDto.tags);
          if (!validation.isValid) {
            return APIResponse.error(
              response,
              apiId,
              API_RESPONSES.BAD_REQUEST,
              `${API_RESPONSES.INVALID_TAG_IDS
              }: ${validation.invalidTagIds.join(', ')}`,
              HttpStatus.BAD_REQUEST
            );
          }
        }
      }

      let newImageUrl: string | null = null;
      const dtoImageUrl = updatePathwayDto.image_url;
      if (dtoImageUrl !== undefined && dtoImageUrl !== null && typeof dtoImageUrl === 'string' && dtoImageUrl.trim() !== '') {
        newImageUrl = dtoImageUrl.trim();
        if (oldImageUrl) {
          await this.deleteImageFromS3(oldImageUrl);
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
      if (updatePathwayDto.tags !== undefined && updatePathwayDto.tags !== null) {
        // Store as PostgreSQL text[] array
        // Empty array is valid, so we allow it
        updateData.tags = Array.isArray(updatePathwayDto.tags) ? updatePathwayDto.tags : [];
      }
      if (updatePathwayDto.display_order !== undefined) {
        updateData.display_order = updatePathwayDto.display_order;
      }
      if (updatePathwayDto.is_active !== undefined) {
        updateData.is_active = updatePathwayDto.is_active;
      }
      if (newImageUrl !== null) {
        updateData.image_url = newImageUrl;
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
        image_url: pathwayData.image_url,
        created_at: pathwayData.created_at,
      };

      // Invalidate pathway list cache after successful update
      try {
        await this.cacheService.delByPattern('pathway:list:*');
        this.logger.debug('Invalidated pathway list cache after update');
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to invalidate pathway list cache: ${cacheError?.message || cacheError}`
        );
      }

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
          id: currentActive.id,
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

      let activeId = existingTargetRecord ? existingTargetRecord.id : null;
      
      // Atomic Transaction: Deactivate current and Reactivate/Activate target
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
          await manager.update(
            UserPathwayHistory,
            { id: existingTargetRecord.id },
            {
              is_active: true,
              activated_at: timestamp,
              deactivated_at: null,
              user_goal: userGoal,
              updated_by: null
            }
          );
          activeId = existingTargetRecord.id;
        } else {
          // CREATE: New history record
          const record = manager.create(UserPathwayHistory, {
            user_id: userId,
            pathway_id: pathwayId,
            is_active: true,
            activated_at: timestamp,
            user_goal: userGoal,
            created_by: created_by,
            updated_by: null
          });
          const savedRecord = await manager.save(record);
          activeId = savedRecord.id;
        }
      });

      const result = {
        id: activeId,
        userId,
        previousPathwayId,
        currentPathwayId: pathwayId,
        activatedAt: timestamp,
        deactivated_at: currentActive ? timestamp : null,
        userGoal: userGoal,
        created_by: created_by,
        updated_by: null,
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error handling pathway assignment: ${errorMessage}`,
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
    response: Response,
    pathwayId?: string
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

      // 2. Build where condition based on whether pathwayId is provided
      const whereCondition: any = { user_id: userId };
      if (pathwayId) {
        whereCondition.pathway_id = pathwayId;
      } else {
        whereCondition.is_active = true;
      }

      // 3. Get pathway from user_pathway_history
      const userPathway = await this.userPathwayHistoryRepository.findOne({
        where: whereCondition,
        select: [
          'id',
          'pathway_id',
          'activated_at',
          'deactivated_at',
          'user_goal',
          'is_active',
        ],
      });

      if (!userPathway) {
        const message = pathwayId
          ? 'Specified pathway assignment not found for this user'
          : 'No active pathway found for this user';
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          message,
          HttpStatus.NOT_FOUND
        );
      }

      const result = {
        id: userPathway.id,
        pathwayId: userPathway.pathway_id,
        activatedAt: userPathway.activated_at,
        userGoal: userPathway.user_goal,
        isActive: userPathway.is_active,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        'Pathway assignment retrieved successfully'
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error getting active pathway: ${errorMessage}`,
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
      key = `pathway_${Date.now()}`;
    }

    // Step 2: Uniqueness check with prefix search
    const existingKeys = await this.pathwayRepository.find({
      where: {
        key: Like(`${key}%`),
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
    let uniqueKey = `${key}_${counter}`;

    // Ensure suffix doesn't exceed length limit
    while (keySet.has(uniqueKey)) {
      counter++;
      const suffix = `_${counter}`;
      if (key.length + suffix.length > 50) {
        // Trim base key to fit suffix
        const trimmedBase = key.substring(0, 50 - suffix.length);
        uniqueKey = `${trimmedBase}${suffix}`;
      } else {
        uniqueKey = `${key}${suffix}`;
      }

      // Safety break
      if (counter > 1000) break;
    }

    return uniqueKey;
  }

  /**
   * Bulk update pathway display orders
   */
  async updateOrderStructure(
    bulkUpdateOrderDto: BulkUpdateOrderDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_ORDER_STRUCTURE;
    try {
      const { orders } = bulkUpdateOrderDto;

      // Update each pathway order
      // We process them sequentially for simplicity and safety
      for (const orderItem of orders) {
        await this.pathwayRepository.update(
          { id: orderItem.id },
          {
            display_order: orderItem.order,
            updated_at: new Date(),
          }
        );
      }

      // Invalidate pathway list cache after order/structure update
      try {
        await this.cacheService.delByPattern('pathway:list:*');
        this.logger.debug('Invalidated pathway list cache after order structure update');
      } catch (cacheError: any) {
        this.logger.warn(
          `Failed to invalidate pathway list cache: ${cacheError?.message || cacheError}`
        );
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
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error updating pathway order structure: ${errorMessage}`,
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
