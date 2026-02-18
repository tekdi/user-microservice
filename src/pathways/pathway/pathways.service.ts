import {
  Injectable,
  HttpStatus,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, DataSource, Like, ILike, Not } from "typeorm";
import * as crypto from "node:crypto";
import { CacheService } from "src/cache/cache.service";
import { Pathway } from "./entities/pathway.entity";
import { Tag } from "../tags/entities/tag.entity";
import { CreatePathwayDto } from "./dto/create-pathway.dto";
import { UpdatePathwayDto } from "./dto/update-pathway.dto";
import { ListPathwayDto } from "./dto/list-pathway.dto";
import {
  BulkUpdateOrderDto,
} from "./dto/update-pathway-order.dto";
import { StringUtil } from "../common/utils/string.util";
import { MAX_PAGINATION_LIMIT } from "../common/dto/pagination.dto";
import { AssignPathwayDto } from "./dto/assign-pathway.dto";
import { UserPathwayHistory } from "./entities/user-pathway-history.entity";
import { User } from "../../user/entities/user-entity";
import { LmsClientService } from "../common/services/lms-client.service";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { Response } from "express";
import { S3StorageProvider } from "../../storage/providers/s3-storage.provider";
import { ConfigService } from "@nestjs/config";
import { isUUID } from "class-validator";
import { ActivePathwayDto } from "./dto/active-pathway.dto";

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
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService
  ) {
    // Initialize S3StorageProvider for image uploads
    this.s3StorageProvider = new S3StorageProvider(this.configService);
  }

  /**
   * Normalize path key: trim leading/trailing slashes and collapse consecutive slashes.
   * Uses simple string iteration (O(n)) to avoid any regex and ReDoS risk.
   */
  private normalizePathKey(s: string): string {
    const trimmed = this.trimSlashes(s);
    if (!trimmed) return "";

    const segments = trimmed.split("/").filter((seg) => seg.length > 0);
    return segments.join("/");
  }

  /**
   * Helper to trim leading and trailing slashes
   */
  private trimSlashes(s: string): string {
    let start = 0;
    while (start < s.length && s[start] === "/") start++;
    let end = s.length;
    while (end > start && s[end - 1] === "/") end--;
    return s.slice(start, end);
  }

  /**
   * Sanitized pathway storage key prefix from env (single source of truth for PATHWAY_STORAGE_KEY_PREFIX).
   */
  private getPathwayStoragePrefix(): string {
    const raw =
      this.configService.get<string>("PATHWAY_STORAGE_KEY_PREFIX") ||
      "pathway-images/pathway/files";
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
      this.configService.get<string>("AWS_UPLOAD_FILE_EXPIRY") || "3600",
      10
    );
    return {
      pathway_upload_path,
      presigned_url_expires_in,
      image_mime_type: "image/jpeg, image/jpg, image/png, image/svg+xml",
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
    const allowedMimeTypes = config.image_mime_type
      .split(",")
      .map((s) => s.trim().toLowerCase());
    const contentTypeLower = (contentType || "").trim().toLowerCase();
    if (!allowedMimeTypes.includes(contentTypeLower)) {
      throw new BadRequestException(
        `contentType must be one of: ${config.image_mime_type}. Received: ${contentType || "(empty)"
        }`
      );
    }
    const maxSizeBytes = config.image_filesize * 1024 * 1024;
    const cappedSizeLimit =
      sizeLimit == null ? maxSizeBytes : Math.min(sizeLimit, maxSizeBytes);

    const prefix = this.getPathwayStoragePrefix();
    const fileName = (key || "").trim();
    if (!fileName) {
      throw new BadRequestException("Key (file name) is required");
    }
    if (
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("..")
    ) {
      throw new BadRequestException(
        "Key must be a file name only (no path or path traversal). Example: file_1771313851464_f195e1.png"
      );
    }
    const fullKey = prefix ? `${prefix}/${fileName}` : fileName;
    const { url, fields } = await this.s3StorageProvider.getPresignedPostForKey(
      fullKey,
      contentType,
      {
        expiresIn,
        sizeLimit: cappedSizeLimit,
      }
    );
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
  async deletePathwayStorageFile(
    keyOrUrl: string,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_STORAGE_DELETE;
    const prefix = this.getPathwayStoragePrefix();
    const prefixWithSlash = prefix ? `${prefix}/` : "";
    let s3Key: string;
    if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
      const extracted = this.extractS3KeyFromUrl(keyOrUrl);
      if (!extracted) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "Invalid file URL",
          HttpStatus.BAD_REQUEST
        );
      }
      s3Key = extracted;
    } else {
      s3Key = this.normalizePathKey(keyOrUrl);
    }
    if (!prefixWithSlash || !s3Key.startsWith(prefixWithSlash)) {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.BAD_REQUEST,
        `File key must be a file under pathway storage prefix (${prefix}/), not the prefix itself`,
        HttpStatus.BAD_REQUEST
      );
    }
    try {
      await this.s3StorageProvider.delete(s3Key);
      return APIResponse.success(
        response,
        apiId,
        { deleted: true, key: s3Key },
        HttpStatus.OK,
        "File deleted from storage"
      );
    } catch (error) {
      this.logger.warn(
        `Pathway storage delete failed: key=${s3Key}, error=${error instanceof Error ? error.message : "Unknown"
        }`
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        "Failed to delete file from storage",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
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
      const key = urlObj.pathname.replace(/^\//, "");
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
      this.logger.warn(
        `Failed to delete image from S3: ${imageUrl}, error: ${error instanceof Error ? error.message : "Unknown error"
        }`
      );
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
      select: ["id"],
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
      select: ["id", "name", "alias"],
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
      select: ["id"],
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
        ),
      };
    }

    // 2. Check if pathway with same key already exists
    const existingPathway = await this.pathwayRepository.findOne({
      where: { key },
      select: ["id", "key"],
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
        ),
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
            `${API_RESPONSES.INVALID_TAG_IDS}: ${validation.invalidTagIds.join(
              ", "
            )} `,
            HttpStatus.BAD_REQUEST
          ),
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Internal logic to calculate a unique display order
   * Falls back to auto-increment if provided order is a duplicate
   */
  private async calculateDisplayOrder(
    requestedOrder?: number
  ): Promise<number> {
    let displayOrder = requestedOrder;
    let needsAutoGeneration =
      displayOrder === undefined || displayOrder === null;

    if (!needsAutoGeneration) {
      // Check if forcefully provided order is already taken
      const existingWithOrder = await this.pathwayRepository.findOne({
        where: { display_order: displayOrder },
        select: ["id"],
      });
      if (existingWithOrder) {
        needsAutoGeneration = true;
      }
    }

    if (needsAutoGeneration) {
      const maxOrderResult = await this.pathwayRepository
        .createQueryBuilder("pathway")
        .select("MAX(pathway.display_order)", "max")
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
      const key =
        createPathwayDto.key ||
        (await this.generateUniqueKey(createPathwayDto.name));

      const validation = await this.validatePathwayCreation(
        createPathwayDto,
        key,
        apiId,
        response
      );
      if (!validation.isValid) return validation.errorResponse;

      const savedPathway = await this.executeCreateWithRetries(
        createPathwayDto,
        key,
        userId,
        apiId
      );

      const tagDetails = await this.fetchTagDetails(savedPathway.tags || []);
      await this.invalidatePathwayCache(apiId);

      const result = {
        id: savedPathway.id,
        key: savedPathway.key,
        name: savedPathway.name,
        description: savedPathway.description,
        tags: tagDetails,
        display_order: savedPathway.display_order,
        is_active: savedPathway.is_active,
        image_url: savedPathway.image_url,
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
      return this.handleCreateError(error, apiId, response);
    }
  }

  /**
   * Internal helper to execute creation with retries for display order collision
   */
  private async executeCreateWithRetries(
    dto: CreatePathwayDto,
    key: string,
    userId: string | null,
    apiId: string
  ): Promise<Pathway> {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        const displayOrder = await this.calculateDisplayOrder(
          dto.display_order
        );
        const pathwayData = {
          ...dto,
          key,
          display_order: displayOrder,
          is_active: dto.is_active ?? true,
          tags: (dto as any).tags || [],
          created_by: userId,
          updated_by: userId,
        };

        return await this.pathwayRepository.save(
          this.pathwayRepository.create(pathwayData)
        );
      } catch (error) {
        const isDisplayOrderConflict =
          error.code === "23505" && error.detail?.includes("display_order");

        if (isDisplayOrderConflict && attempts < MAX_ATTEMPTS) {
          LoggerUtil.warn(
            `Display order collision detected(attempt ${attempts}).Retrying...`,
            apiId
          );
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to create pathway after maximum retry attempts");
  }

  /**
   * Internal helper to invalidate pathway search cache
   */
  private async invalidatePathwayCache(apiId: string): Promise<void> {
    try {
      await this.cacheService.delByPattern("pathway:search:*");
      LoggerUtil.log("Invalidated pathway search cache", apiId);
    } catch (cacheError) {
      LoggerUtil.warn(
        `Failed to invalidate pathway search cache: ${cacheError.message}`,
        apiId
      );
    }
  }

  /**
   * Internal helper to handle create errors
   */
  private handleCreateError(
    error: any,
    apiId: string,
    response: Response
  ): Response {
    if (error.code === "23505") {
      LoggerUtil.error(
        `${API_RESPONSES.CONFLICT} `,
        `Conflict error details: ${error.detail} `,
        apiId
      );
      const detail = error.detail || "";
      if (detail.includes("display_order")) {
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
      const cacheKey = this.generatePathwayListCacheKey(listPathwayDto);
      const cachedDb = await this.cacheService.get<any>(cacheKey);

      if (cachedDb) {
        LoggerUtil.log(`Cache HIT for pathway search (DB): ${cacheKey}`, apiId);
        return this.respondWithEnrichedPathways(
          cachedDb.items,
          cachedDb.totalCount,
          cachedDb.limit,
          cachedDb.offset,
          tenantId,
          organisationId,
          apiId,
          response
        );
      }

      LoggerUtil.log(`Cache MISS for pathway search: ${cacheKey}`, apiId);
      const limit = Math.min(listPathwayDto.limit ?? 10, MAX_PAGINATION_LIMIT);
      const offset = listPathwayDto.offset ?? 0;

      const { items: rawItems, totalCount } = await this.fetchPathwaysFromDb(
        listPathwayDto,
        limit,
        offset
      );

      const dbItems = await this.resolveTagsForPathways(rawItems);
      await this.cacheService.set(
        cacheKey,
        { items: dbItems, totalCount, limit, offset },
        300
      );

      return this.respondWithEnrichedPathways(
        dbItems,
        totalCount,
        limit,
        offset,
        tenantId,
        organisationId,
        apiId,
        response
      );
    } catch (error) {
      return this.handleListError(error, apiId, response);
    }
  }

  /**
   * Helper to generate cache key for pathway list
   */
  private generatePathwayListCacheKey(dto: ListPathwayDto): string {
    return `pathway:search:${crypto
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
   * Helper to fetch pathways from DB with filtering
   */
  private async fetchPathwaysFromDb(
    dto: ListPathwayDto,
    limit: number,
    offset: number
  ): Promise<{ items: Pathway[]; totalCount: number }> {
    const filters = dto.filters || {};
    const needsTextSearch = !!(filters.name || filters.description);

    if (needsTextSearch) {
      const queryBuilder = this.pathwayRepository.createQueryBuilder("pathway");
      if (filters.id)
        queryBuilder.andWhere("pathway.id = :id", { id: filters.id });
      if (filters.name) {
        queryBuilder.andWhere("pathway.name ILIKE :name", {
          name: `% ${filters.name}% `,
        });
      }
      if (filters.description) {
        queryBuilder.andWhere("pathway.description ILIKE :description", {
          description: `% ${filters.description}% `,
        });
      }
      if (filters.isActive !== undefined) {
        queryBuilder.andWhere("pathway.is_active = :isActive", {
          isActive: filters.isActive,
        });
      }
      queryBuilder.orderBy("pathway.display_order", "ASC");
      queryBuilder.addOrderBy("pathway.created_at", "DESC");
      queryBuilder.skip(offset).take(limit);

      const [items, totalCount] = await queryBuilder.getManyAndCount();
      return { items, totalCount };
    }

    const where: any = {};
    if (filters.id) where.id = filters.id;
    if (filters.isActive !== undefined) where.is_active = filters.isActive;

    const [items, totalCount] = await this.pathwayRepository.findAndCount({
      where,
      order: { display_order: "ASC", created_at: "DESC" },
      take: limit,
      skip: offset,
    });
    return { items, totalCount };
  }

  /**
   * Helper to resolve tags for a list of pathways
   */
  private async resolveTagsForPathways(pathways: Pathway[]): Promise<any[]> {
    const allTagIds = new Set<string>();
    pathways.forEach((p) => {
      const tags = (p as any).tags;
      if (tags && Array.isArray(tags)) {
        tags.forEach((t) => {
          if (t) allTagIds.add(t);
        });
      }
    });

    const tagMap = new Map<string, { id: string; name: string }>();
    if (allTagIds.size > 0) {
      const details = await this.fetchTagDetails(Array.from(allTagIds));
      details.forEach((d) => tagMap.set(d.id, d));
    }

    return pathways.map((p) => {
      const tagIds = (p as any).tags || [];
      const tags = tagIds
        .map((tid: string) => tagMap.get(tid))
        .filter((t: any) => t !== undefined);

      return {
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        tags,
        display_order: p.display_order,
        is_active: p.is_active,
        created_at: p.created_at,
        image_url: p.image_url,
      };
    });
  }

  /**
   * Helper to enrich with LMS counts and respond
   */
  private async respondWithEnrichedPathways(
    items: any[],
    totalCount: number,
    limit: number,
    offset: number,
    tenantId: string,
    organisationId: string,
    apiId: string,
    response: Response
  ): Promise<Response> {
    const pathwayIds = items
      .filter((i) => i?.id != null && typeof i.id === "string")
      .map((i) => i.id);

    const countsMap = await this.lmsClientService.getBatchCounts(
      pathwayIds,
      tenantId,
      organisationId
    );

    const enrichedItems = items.map((i) => {
      const counts = countsMap.get(i.id);
      return {
        ...i,
        video_count: counts?.videoCount ?? 0,
        resource_count: counts?.resourceCount ?? 0,
        total_items: (counts as any)?.totalItems ?? 0,
      };
    });

    return APIResponse.success(
      response,
      apiId,
      { count: items.length, totalCount, limit, offset, items: enrichedItems },
      HttpStatus.OK,
      API_RESPONSES.PATHWAY_LIST_SUCCESS
    );
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
    LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR} `, msg, apiId);
    return APIResponse.error(
      response,
      apiId,
      API_RESPONSES.INTERNAL_SERVER_ERROR,
      msg,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
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
      if (!isUUID(id)) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.UUID_VALIDATION,
          HttpStatus.BAD_REQUEST
        );
      }

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

      const tagValidation = await this.validateTagsOnUpdate(
        updatePathwayDto.tags,
        apiId,
        response
      );
      if (tagValidation) return tagValidation;

      const newImageUrl = await this.handleImageOnUpdate(
        updatePathwayDto.image_url,
        existingPathway.image_url
      );

      const payload = await this.prepareUpdatePayload(
        id,
        updatePathwayDto,
        newImageUrl,
        userId,
        apiId,
        response
      );
      if (payload.error) return payload.error;

      await this.pathwayRepository.update({ id }, payload.data as any);
      await this.invalidatePathwayCache(apiId);

      const updatedPathway = await this.pathwayRepository.findOne({
        where: { id },
      });

      const tagDetails = await this.fetchTagDetails(
        (updatedPathway as any).tags || []
      );
      const result = {
        ...updatedPathway,
        tags: tagDetails,
      } as any;

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      return this.handleUpdateError(error, apiId, response);
    }
  }

  /**
   * Helper to validate tags during update
   */
  private async validateTagsOnUpdate(
    tags: string[] | undefined | null,
    apiId: string,
    response: Response
  ): Promise<Response | null> {
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const validation = await this.validateTagIds(tags);
      if (!validation.isValid) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          `${API_RESPONSES.INVALID_TAG_IDS}: ${validation.invalidTagIds.join(
            ", "
          )} `,
          HttpStatus.BAD_REQUEST
        );
      }
    }
    return null;
  }

  /**
   * Helper to handle image replacement during update
   */
  private async handleImageOnUpdate(
    dtoImageUrl: string | undefined | null,
    oldImageUrl: string | null
  ): Promise<string | null> {
    if (typeof dtoImageUrl === "string" && dtoImageUrl.trim() !== "") {
      const newImageUrl = dtoImageUrl.trim();
      if (oldImageUrl) await this.deleteImageFromS3(oldImageUrl);
      return newImageUrl;
    }
    return null;
  }

  /**
   * Helper to prepare partial update payload
   */
  private async prepareUpdatePayload(
    id: string,
    dto: UpdatePathwayDto,
    newImageUrl: string | null,
    userId: string | null,
    apiId: string,
    response: Response
  ): Promise<{ data?: Partial<Pathway>; error?: Response }> {
    const updateData: any = {};

    if (dto.name !== undefined) {
      const conflict = await this.pathwayRepository.findOne({
        where: { name: ILike(dto.name), is_active: true, id: Not(id) },
        select: ["id"],
      });
      if (conflict) {
        return {
          error: APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            "An active pathway with this name already exists",
            HttpStatus.CONFLICT
          ),
        };
      }
      updateData.name = dto.name;
    }

    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.tags !== undefined && dto.tags !== null) {
      updateData.tags = Array.isArray(dto.tags) ? dto.tags : [];
    }
    if (dto.display_order !== undefined)
      updateData.display_order = dto.display_order;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    if (newImageUrl !== null) updateData.image_url = newImageUrl;
    if (userId) updateData.updated_by = userId;

    if (Object.keys(updateData).length === 0) {
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
    return { data: updateData };
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
        `${API_RESPONSES.PATHWAY_KEY_EXISTS} (${error.detail})`,
        HttpStatus.CONFLICT
      );
    }
    const msg = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
    LoggerUtil.error(`${API_RESPONSES.SERVER_ERROR} `, msg, apiId);
    return APIResponse.error(
      response,
      apiId,
      API_RESPONSES.INTERNAL_SERVER_ERROR,
      msg,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
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
        select: ["userId"],
      });

      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "User not found",
          HttpStatus.NOT_FOUND
        );
      }

      // 2. Validate target pathway existence and active status
      const pathway = await this.pathwayRepository.findOne({
        where: { id: pathwayId, is_active: true },
        select: ["id"],
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "Active pathway not found",
          HttpStatus.NOT_FOUND
        );
      }

      // 3. Find currently active pathway
      const currentActive = await this.userPathwayHistoryRepository.findOne({
        where: { user_id: userId, is_active: true },
      });

      // 4. Check if target pathway already has a history record for this user
      // If found, we will REACTIVATE it instead of creating a new one
      const existingTargetRecord =
        await this.userPathwayHistoryRepository.findOne({
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
          "Pathway is already active"
        );
      }

      const timestamp = new Date();
      const previousPathwayId = currentActive ? currentActive.pathway_id : null;

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
              updated_by: updated_by || created_by,
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
              updated_by: null, // Refined: null when deactivated_at is null
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
            updated_by: null, // Refined: null on initial creation
          });
          await manager.save(record);
        }
      });

      // Fetch the active record after transaction to get its id
      const activeRecord = await this.userPathwayHistoryRepository.findOne({
        where: { user_id: userId, pathway_id: pathwayId, is_active: true },
        select: ["id"],
      });

      const result = {
        id: activeRecord?.id ?? null,
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
   * If pathwayId is provided, retrieves that specific history record if it belongs to the user
   */
  async getActivePathway(
    activePathwayDto: ActivePathwayDto,
    // userId: string,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_GET_ACTIVE;
    const { userId, pathwayId } = activePathwayDto;

    try {
      // Validate UUID format
      if (!isUUID(userId)) {
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
        select: ["userId"],
      });

      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "User not found",
          HttpStatus.NOT_FOUND
        );
      }

      let activePathway;

      if (pathwayId) {
        // If pathwayId is provided, fetch specific history record for this user and pathway
        activePathway = await this.userPathwayHistoryRepository.findOne({
          where: { user_id: userId, pathway_id: pathwayId },
          select: [
            "id",
            "pathway_id",
            "activated_at",
            "user_goal",
            "is_active",
          ],
          order: { activated_at: "DESC" }, // Get most recent if multiple (shouldn't happen usually)
        });
      } else {
        // If only userId is provided, fetch the currently active pathway
        activePathway = await this.userPathwayHistoryRepository.findOne({
          where: { user_id: userId, is_active: true },
          select: ["id", "pathway_id", "activated_at", "user_goal"],
        });
      }

      if (!activePathway) {
        const msg = pathwayId
          ? "Pathway history not found for this user and pathway"
          : "No active pathway found for this user";

        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          msg,
          HttpStatus.NOT_FOUND
        );
      }

      const result = {
        id: activePathway.id,
        pathwayId: activePathway.pathway_id,
        activatedAt: activePathway.activated_at,
        userGoal: activePathway.user_goal,
        isActive: activePathway.is_active, // Helpful to know if specific pathway requested
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "pathway retrieved successfully"
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
      select: ["key"],
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
      const ids = orders.map((o) => o.id);
      const orderValues = orders.map((o) => o.order);

      if (new Set(ids).size !== ids.length) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "Duplicate IDs found in request",
          HttpStatus.BAD_REQUEST
        );
      }
      if (new Set(orderValues).size !== orderValues.length) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "Duplicate order values found in request",
          HttpStatus.BAD_REQUEST
        );
      }

      // 2. Validate that all pathways exist before starting the transaction
      const existingPathways = await this.pathwayRepository.find({
        where: { id: In(ids) },
        select: ["id", "display_order"],
      });

      if (existingPathways.length !== orders.length) {
        const foundIdsSet = new Set(existingPathways.map((p) => p.id));
        const missingIds = ids.filter((id) => !foundIdsSet.has(id));
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          `One or more pathways not found: ${missingIds.join(", ")} `,
          HttpStatus.NOT_FOUND
        );
      }

      // 3. Prevent collisions with pathways NOT in the request
      // If a user reorders A and B but targets an order held by C (which is not in the request),
      // the unique index will block Step 2. We validate this upfront for a clear error message.
      const potentialConflicts = await this.pathwayRepository.find({
        where: { display_order: In(orderValues) },
        select: ["id", "name", "display_order"],
      });

      const externalConflicts = potentialConflicts.filter(
        (p) => !ids.includes(p.id)
      );

      if (externalConflicts.length > 0) {
        const conflictDetails = externalConflicts
          .map((p) => `'${p.name}'(Order ${p.display_order})`)
          .join(", ");
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
          const currentPathway = existingPathways.find(
            (p) => p.id === orderItem.id
          );
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
        await this.cacheService.delByPattern("pathway:search:*");
        LoggerUtil.log(
          "Invalidated pathway search cache after reordering",
          apiId
        );
      } catch (cacheError) {
        LoggerUtil.warn(
          `Failed to invalidate pathway search cache: ${cacheError.message}`,
          apiId
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
