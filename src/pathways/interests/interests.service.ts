import { Injectable, HttpStatus } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
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
    private readonly userPathwayInterestsRepository: Repository<UserPathwayInterests>
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
      });

      const savedInterest = await this.interestRepository.save(interest);

      const result = {
        id: savedInterest.id,
        pathway_id: savedInterest.pathway_id,
        key: savedInterest.key,
        label: savedInterest.label,
        is_active: savedInterest.is_active,
        created_at: savedInterest.created_at,
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
      await this.interestRepository.update({ id }, updateInterestDto);

      const updatedInterest = await this.interestRepository.findOne({
        where: { id },
      });

      const result = {
        id: updatedInterest.id,
        pathway_id: updatedInterest.pathway_id,
        key: updatedInterest.key,
        label: updatedInterest.label,
        is_active: updatedInterest.is_active,
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
      await this.interestRepository.update({ id }, { is_active: false });

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

      // 4. Avoid duplicates for the same visit
      const existingMappings = await this.userPathwayInterestsRepository.find({
        where: {
          user_pathway_history_id: userPathwayHistoryId,
          interest_id: In(uniqueInterestIds),
        },
        select: ['interest_id'],
      });

      const existingInterestIds = new Set(existingMappings.map((m) => m.interest_id));
      const newInterestIds = uniqueInterestIds.filter(
        (id) => !existingInterestIds.has(id)
      );

      // 5. Batch insert new records
      if (newInterestIds.length > 0) {
        const newRecords = newInterestIds.map((interestId) =>
          this.userPathwayInterestsRepository.create({
            user_pathway_history_id: userPathwayHistoryId,
            interest_id: interestId,
          })
        );
        await this.userPathwayInterestsRepository.save(newRecords);
      }

      const result = {
        userPathwayHistoryId,
        savedInterestsCount: newInterestIds.length,
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
}
