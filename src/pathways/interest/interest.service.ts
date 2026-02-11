import {
  Injectable,
  HttpStatus,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Interest } from "./entities/interest.entity";
import { CreateInterestDto } from "./dto/create-interest.dto";
import { UpdateInterestDto } from "./dto/update-interest.dto";
import { ListInterestDto } from "./dto/list-interest.dto";
import { SaveUserInterestsDto } from "./dto/save-user-interests.dto";
import { UserPathwayHistory } from "../entities/user-pathway-history.entity";
import { UserPathwayInterests } from "../entities/user-pathway-interests.entity";
import { In } from "typeorm";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "@utils/response.messages";
// Assuming a new API ID for interest create, or reuse existing pattern if strict ID not required provided in config.
// Using a placeholder or string for now if APIID enum doesn't have it.
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { Response } from "express";
import { Pathway } from "../entities/pathway.entity";

@Injectable()
export class InterestService {
  constructor(
    @InjectRepository(Interest)
    private interestRepository: Repository<Interest>,
    @InjectRepository(Pathway)
    private pathwayRepository: Repository<Pathway>,
    @InjectRepository(UserPathwayHistory)
    private userPathwayHistoryRepository: Repository<UserPathwayHistory>,
    @InjectRepository(UserPathwayInterests)
    private userPathwayInterestsRepository: Repository<UserPathwayInterests>
  ) { }

  async create(
    createInterestDto: CreateInterestDto,
    response: Response
  ): Promise<Response> {
    const apiId = "api.interest.create"; // Explicitly set as per requirement
    try {
      // Check if pathway exists
      const pathway = await this.pathwayRepository.findOne({
        where: { id: createInterestDto.pathway_id },
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "Pathway not found", // Custome message or from constants
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if interest with same key exists for this pathway
      const existingInterest = await this.interestRepository.findOne({
        where: {
          pathway_id: createInterestDto.pathway_id,
          key: createInterestDto.key,
        },
      });

      if (existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          "Interest with this key already exists for the pathway",
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
        "Interest created successfully"
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

  async update(
    id: string,
    updateInterestDto: UpdateInterestDto,
    response: Response
  ): Promise<Response> {
    const apiId = "api.interest.update";
    try {
      // Check if interest exists
      const existingInterest = await this.interestRepository.findOne({
        where: { id },
      });

      if (!existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "Interest not found",
          HttpStatus.NOT_FOUND
        );
      }

      // If key is being updated, check for uniqueness (excluding current interest)
      if (
        updateInterestDto.key &&
        updateInterestDto.key !== existingInterest.key
      ) {
        const duplicateKeyInterest = await this.interestRepository.findOne({
          where: {
            pathway_id: existingInterest.pathway_id,
            key: updateInterestDto.key,
          },
        });

        if (duplicateKeyInterest) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            "Interest with this key already exists for the pathway",
            HttpStatus.CONFLICT
          );
        }
      }

      // Update only provided fields
      const updateResult = await this.interestRepository.update(
        { id },
        updateInterestDto
      );

      if (!updateResult.affected || updateResult.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INTERNAL_SERVER_ERROR,
          "Failed to update interest",
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

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
        "Interest updated successfully"
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

  async delete(id: string, response: Response): Promise<Response> {
    const apiId = "api.interest.delete";
    try {
      // Check if interest exists
      const existingInterest = await this.interestRepository.findOne({
        where: { id },
      });

      if (!existingInterest) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "Interest not found",
          HttpStatus.NOT_FOUND
        );
      }

      // Soft delete: set is_active to false
      existingInterest.is_active = false;
      await this.interestRepository.save(existingInterest);

      const result = {
        id: existingInterest.id,
        deleted: true,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Interest deleted successfully"
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

  async listByPathwayId(
    pathwayId: string,
    response: Response,
    listInterestDto: ListInterestDto
  ): Promise<Response> {
    const apiId = "api.pathway.interests.list";
    const { isActive } = listInterestDto;
    try {
      // Check if pathway exists
      const pathway = await this.pathwayRepository.findOne({
        where: { id: pathwayId },
      });

      if (!pathway) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          "Pathway not found",
          HttpStatus.NOT_FOUND
        );
      }

      // Build filter
      const whereCondition: any = { pathway_id: pathwayId };
      if (isActive !== undefined) {
        whereCondition.is_active = isActive === "true";
      }

      const interests = await this.interestRepository.find({
        where: whereCondition,
      });

      const result = interests.map((interest) => ({
        id: interest.id,
        key: interest.key,
        label: interest.label,
      }));

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Interests retrieved successfully"
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error listing interests by pathway: ${errorMessage}`,
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

  async saveUserInterests(
    saveDto: SaveUserInterestsDto,
    response: Response
  ): Promise<Response> {
    const apiId = "api.user.pathway.interests.save";
    try {
      const { userPathwayHistoryId, interestIds } = saveDto;

      // 1. Validate userPathwayHistoryId
      const historyRecord = await this.userPathwayHistoryRepository.findOne({
        where: { id: userPathwayHistoryId },
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

      // 2. Validate each interestId and ensure they belong to the same pathway
      const validInterests = await this.interestRepository.find({
        where: {
          id: In(interestIds),
          pathway_id: historyRecord.pathway_id,
        },
      });

      if (validInterests.length !== interestIds.length) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          "One or more interests are invalid or do not belong to the correct pathway",
          HttpStatus.BAD_REQUEST
        );
      }

      // 3. Avoid duplicates for the same pathway visit (userPathwayHistoryId)
      const existingMappings = await this.userPathwayInterestsRepository.find({
        where: {
          user_pathway_history_id: userPathwayHistoryId,
          interest_id: In(interestIds),
        },
      });

      const existingInterestIds = existingMappings.map((m) => m.interest_id);
      const newInterestIds = interestIds.filter(
        (id) => !existingInterestIds.includes(id)
      );

      // 4. Insert records
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
        savedInterestsCount: interestIds.length,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "User interests saved successfully"
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
