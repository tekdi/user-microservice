import {
  Injectable,
  HttpStatus,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pathway } from './entities/pathway.entity';
import { CreatePathwayDto } from './dto/create-pathway.dto';
import { UpdatePathwayDto } from './dto/update-pathway.dto';
import { ListPathwayDto } from './dto/list-pathway.dto';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';

@Injectable()
export class PathwaysService {
  constructor(
    @InjectRepository(Pathway)
    private pathwayRepository: Repository<Pathway>,
  ) {}

  /**
   * Create a new pathway
   * Optimized: Single query with conflict check
   */
  async create(
    createPathwayDto: CreatePathwayDto,
    response: Response,
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
          HttpStatus.CONFLICT,
        );
      }

      // Set default is_active if not provided
      const pathwayData = {
        ...createPathwayDto,
        is_active: createPathwayDto.is_active ?? true,
      };

      // Create and save in single operation
      const pathway = this.pathwayRepository.create(pathwayData);
      const savedPathway = await this.pathwayRepository.save(pathway);

      // Return only required fields as per API spec
      const result = {
        id: savedPathway.id,
        key: savedPathway.key,
        name: savedPathway.name,
        is_active: savedPathway.is_active,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.PATHWAY_CREATED_SUCCESSFULLY,
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
          HttpStatus.CONFLICT,
        );
      }

      const errorMessage =
        error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error creating pathway: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * List pathways with optional filter
   * Optimized: Single query with proper indexing
   */
  async list(
    listPathwayDto: ListPathwayDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.PATHWAY_LIST;
    try {
      // Build where clause conditionally
      const whereCondition: Partial<Pathway> = {};
      if (listPathwayDto.isActive !== undefined) {
        whereCondition.is_active = listPathwayDto.isActive;
      }

      // Single optimized query with proper ordering
      // Using indexed columns (is_active, display_order) for performance
      const pathways = await this.pathwayRepository.find({
        where: whereCondition,
        order: {
          display_order: 'ASC',
          created_at: 'DESC',
        },
        // Select only needed fields to reduce payload
        select: [
          'id',
          'key',
          'name',
          'description',
          'tags',
          'display_order',
          'is_active',
          'created_at',
        ],
      });

      return APIResponse.success(
        response,
        apiId,
        pathways,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_LIST_SUCCESS,
      );
    } catch (error) {
      const errorMessage =
        error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing pathways: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
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
          HttpStatus.BAD_REQUEST,
        );
      }

      // Single query to fetch pathway
      const pathway = await this.pathwayRepository.findOne({
        where: { id },
        select: [
          'id',
          'key',
          'name',
          'description',
          'tags',
          'display_order',
          'is_active',
          'created_at',
        ],
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.PATHWAY_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      return APIResponse.success(
        response,
        apiId,
        pathway,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_GET_SUCCESS,
      );
    } catch (error) {
      const errorMessage =
        error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error fetching pathway: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
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
    response: Response,
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
          HttpStatus.BAD_REQUEST,
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
          HttpStatus.NOT_FOUND,
        );
      }

      // OPTIMIZED: Use repository.update() for partial updates
      // This is more efficient than findOne + save as it performs a direct UPDATE query
      const updateResult = await this.pathwayRepository.update(
        { id },
        updatePathwayDto,
      );

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          'Failed to update pathway',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Fetch updated pathway for response
      const updatedPathway = await this.pathwayRepository.findOne({
        where: { id },
        select: [
          'id',
          'key',
          'name',
          'description',
          'tags',
          'display_order',
          'is_active',
          'created_at',
        ],
      });

      return APIResponse.success(
        response,
        apiId,
        updatedPathway,
        HttpStatus.OK,
        API_RESPONSES.PATHWAY_UPDATED_SUCCESSFULLY,
      );
    } catch (error) {
      const errorMessage =
        error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error updating pathway: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

