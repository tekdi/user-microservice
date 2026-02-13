import { Injectable, HttpStatus } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, DataSource } from "typeorm";
import { Interest } from "./entities/interest.entity";
import { CreateInterestDto } from "./dto/create-interest.dto";
import { UpdateInterestDto } from "./dto/update-interest.dto";
import { ListInterestDto } from "./dto/list-interest.dto";
import { MAX_PAGINATION_LIMIT } from "../common/dto/pagination.dto";
import { SaveUserInterestsDto } from "./dto/save-user-interests.dto";
import { UserPathwayHistory } from "../pathway/entities/user-pathway-history.entity";
import { UserPathwayInterests } from "../pathway/entities/user-pathway-interests.entity";
import { Pathway } from "../pathway/entities/pathway.entity";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { Response } from "express";

@Injectable()
export class InterestsService {
  constructor(
    @InjectRepository(Interest)
    private readonly interestRepository: Repository<Interest>,
    @InjectRepository(Pathway)
    private readonly pathwayRepository: Repository<Pathway>,
    @InjectRepository(UserPathwayHistory)
    private readonly userPathwayHistoryRepository: Repository<UserPathwayHistory>,
    @InjectRepository(UserPathwayInterests)
    private readonly userPathwayInterestsRepository: Repository<UserPathwayInterests>,
    private readonly dataSource: DataSource
  ) { }

  /**
   * Create a new interest for a pathway
   * Optimized: Conflict check and explicit result mapping
   */
  async create(
    createInterestDto: CreateInterestDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.INTEREST_CREATE;
    try {
      // Check if pathway exists
      const pathway = await this.pathwayRepository.findOne({
        where: { id: createInterestDto.pathway_id },
        select: ['id'],
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.PATHWAY_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if interest with same key exists for this pathway
      const existingInterest = await this.interestRepository.findOne({
        where: {
          pathway_id: createInterestDto.pathway_id,
          key: createInterestDto.key,
        },
        select: ['id'],
      });

      if (existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.INTEREST_KEY_EXISTS,
          HttpStatus.CONFLICT
        );
      }

      const interest = this.interestRepository.create({
        ...createInterestDto,
        is_active: createInterestDto.is_active ?? true,
        // created_by is already snake_case in DTO now
      });

      const savedInterest = await this.interestRepository.save(interest);

      const result = {
        id: savedInterest.id,
        pathway_id: savedInterest.pathway_id,
        key: savedInterest.key,
        label: savedInterest.label,
        is_active: savedInterest.is_active,
        created_at: savedInterest.created_at,
        created_by: savedInterest.created_by,
        // updated_by/updated_at will be null initially
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.INTEREST_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error creating interest: ${errorMessage}`,
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
   * Update an interest
   * Optimized: Partial update using repository.update()
   */
  async update(
    id: string,
    updateInterestDto: UpdateInterestDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.INTEREST_UPDATE;
    try {
      // Check if interest exists
      const existingInterest = await this.interestRepository.findOne({
        where: { id },
        select: ['id', 'key', 'pathway_id'],
      });

      if (!existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.INTEREST_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // If key is being updated, check for uniqueness within the same pathway
      if (
        updateInterestDto.key &&
        updateInterestDto.key !== existingInterest.key
      ) {
        const duplicateKeyInterest = await this.interestRepository.findOne({
          where: {
            pathway_id: existingInterest.pathway_id,
            key: updateInterestDto.key,
          },
          select: ['id'],
        });

        if (duplicateKeyInterest) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            API_RESPONSES.INTEREST_KEY_EXISTS,
            HttpStatus.CONFLICT
          );
        }
      }

      // OPTIMIZED: Use repository.update() for partial updates
      await this.interestRepository.update(
        { id },
        {
          ...updateInterestDto,
          updated_at: new Date(),
        }
      );

      const updatedInterest = await this.interestRepository.findOne({
        where: { id },
      });

      if (!updatedInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.INTEREST_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      const result = {
        id: updatedInterest.id,
        pathway_id: updatedInterest.pathway_id,
        key: updatedInterest.key,
        label: updatedInterest.label,
        is_active: updatedInterest.is_active,
        created_at: updatedInterest.created_at,
        created_by: updatedInterest.created_by,
        updated_at: updatedInterest.updated_at,
        updated_by: updatedInterest.updated_by,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.INTEREST_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error updating interest: ${errorMessage}`,
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
   * Soft delete an interest
   */
  async delete(id: string, response: Response): Promise<Response> {
    const apiId = APIID.INTEREST_DELETE;
    try {
      const existingInterest = await this.interestRepository.findOne({
        where: { id },
        select: ['id'],
      });

      if (!existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.INTEREST_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // Soft delete: set is_active to false
      await this.interestRepository.update(
        { id },
        {
          is_active: false,
          updated_at: new Date(),
          // Note: addedBy/updatedBy for delete would require DTO change for delete API
        }
      );

      const result = {
        id: id,
        is_active: false,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.INTEREST_DELETED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error deleting interest: ${errorMessage}`,
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
   * List interests by pathway ID with pagination
   * Optimized: Uses findAndCount for efficient pagination
   */
  async listByPathwayId(
    pathwayId: string,
    response: Response,
    listInterestDto: ListInterestDto
  ): Promise<Response> {
    const apiId = APIID.INTEREST_LIST_BY_PATHWAY;
    const { isActive, limit: requestedLimit, offset } = listInterestDto;
    try {
      // Check if pathway exists
      const pathway = await this.pathwayRepository.findOne({
        where: { id: pathwayId },
        select: ['id'],
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

      // Build filter
      const whereCondition: any = { pathway_id: pathwayId };
      if (isActive !== undefined) {
        whereCondition.is_active = isActive;
      }

      // Set pagination defaults with safeguard to prevent unbounded queries
      const limit = requestedLimit
        ? Math.min(requestedLimit, MAX_PAGINATION_LIMIT)
        : 10;
      const skip = offset ?? 0;

      // OPTIMIZED: Use findAndCount for efficient pagination
      const [items, totalCount] = await this.interestRepository.findAndCount({
        where: whereCondition,
        select: ['id', 'key', 'label', 'is_active', 'created_at'],
        order: {
          created_at: 'DESC',
        },
        take: limit,
        skip: skip,
      });

      // Return paginated result with count
      const result = {
        count: items.length,
        totalCount: totalCount,
        limit: limit,
        offset: skip,
        items: items,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.INTEREST_LIST_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing interests: ${errorMessage}`,
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
   * Save user interests for a pathway visit
   * Logic: Validates history record and interest IDs before saving
   */
  async saveUserInterests(
    saveDto: SaveUserInterestsDto,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.USER_INTERESTS_SAVE;
    try {
      const { userPathwayHistoryId, interestIds } = saveDto;

      // 1. Deduplicate interestIds (Optimization from CodeRabbit)
      const uniqueInterestIds = [...new Set(interestIds)];

      // 2. Validate userPathwayHistoryId
      const historyRecord = await this.userPathwayHistoryRepository.findOne({
        where: { id: userPathwayHistoryId },
        select: ['id', 'pathway_id'],
      });

      if (!historyRecord) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "User pathway history record not found",
          HttpStatus.NOT_FOUND
        );
      }

      // 3. Validate each interestId in batch
      const validInterests = await this.interestRepository.find({
        where: {
          id: In(uniqueInterestIds),
          pathway_id: historyRecord.pathway_id,
        },
        select: ['id'],
      });

      if (validInterests.length !== uniqueInterestIds.length) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "One or more interests are invalid, duplicate, or do not belong to the correct pathway",
          HttpStatus.BAD_REQUEST
        );
      }

      // 4. Fetch existing mappings for this record
      const existingMappings = await this.userPathwayInterestsRepository.find({
        where: { user_pathway_history_id: userPathwayHistoryId },
        select: ["interest_id"],
      });

      const existingInterestIds = new Set(existingMappings.map((m) => m.interest_id));
      const requestedInterestIdsSet = new Set(uniqueInterestIds);

      // Identify IDs to add (in request but not in DB)
      const interestIdsToAdd = uniqueInterestIds.filter(
        (id) => !existingInterestIds.has(id)
      );

      // Identify IDs to remove (in DB but not in request)
      const interestIdsToRemove = Array.from(existingInterestIds).filter(
        (id) => !requestedInterestIdsSet.has(id)
      );

      // 5. Atomic transaction to Sync (Add/Delete)
      await this.dataSource.transaction(async (manager) => {
        // Delete unchecked interests
        if (interestIdsToRemove.length > 0) {
          await manager.delete(UserPathwayInterests, {
            user_pathway_history_id: userPathwayHistoryId,
            interest_id: In(interestIdsToRemove),
          });
        }

        // Add new selection
        if (interestIdsToAdd.length > 0) {
          const newRecords = interestIdsToAdd.map((interestId) =>
            manager.create(UserPathwayInterests, {
              user_pathway_history_id: userPathwayHistoryId,
              interest_id: interestId,
              created_by: saveDto.created_by,
            })
          );
          await manager.save(newRecords);
        }
      });

      const result = {
        userPathwayHistoryId,
        addedCount: interestIdsToAdd.length,
        removedCount: interestIdsToRemove.length,
        totalSavedCount: uniqueInterestIds.length,
        created_by: saveDto.created_by,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.USER_INTERESTS_SAVED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error saving user interests: ${errorMessage}`,
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
   * List saved interests for a specific user pathway history record
   * Returns a simplified list of interests (ID, key, label)
   */
  async listUserInterests(
    userPathwayHistoryId: string,
    response: Response
  ): Promise<Response> {
    const apiId = APIID.USER_INTERESTS_LIST;
    try {
      // 1. Verify history record exists
      const historyExists = await this.userPathwayHistoryRepository.findOne({
        where: { id: userPathwayHistoryId },
        select: ['id'],
      });

      if (!historyExists) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "User pathway history record not found",
          HttpStatus.NOT_FOUND
        );
      }

      // 2. Fetch linked interest IDs
      const mapping = await this.userPathwayInterestsRepository.find({
        where: { user_pathway_history_id: userPathwayHistoryId },
        select: ['interest_id'],
      });

      if (mapping.length === 0) {
        return APIResponse.success(
          response,
          apiId,
          [],
          HttpStatus.OK,
          API_RESPONSES.INTEREST_LIST_SUCCESS
        );
      }

      const interestIds = mapping.map((m) => m.interest_id);

      // 3. Fetch full interest details (reusing interestRepository "internal" logic)
      // This avoids N+1 and maintains high performance
      const interests = await this.interestRepository.find({
        where: { id: In(interestIds) },
        select: ['id', 'key', 'label'],
      });

      // 4. Map to requested format
      const result = interests.map((interest) => ({
        interestId: interest.id,
        key: interest.key,
        label: interest.label,
      }));

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.INTEREST_LIST_SUCCESS
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing user interests: ${errorMessage}`,
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
