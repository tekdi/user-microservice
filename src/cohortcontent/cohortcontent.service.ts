import { Injectable, NotFoundException, HttpStatus } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Request, Response } from "express";
import { CohortContent } from "./entities/cohort-content.entity";
import {
  CohortContentDto,
  UpdateCohortContentDto,
} from "./dto/cohort-content.dto";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "src/common/utils/response.messages";
import { APIID } from "src/common/utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";

@Injectable()
export class CohortContentService {
  constructor(
    @InjectRepository(CohortContent)
    private readonly cohortContentRepository: Repository<CohortContent>
  ) {}

  async create(
    createCohortContentDto: CohortContentDto,
    response: Response
  ): Promise<Response> {
    let apiId = APIID.COHORT_CONTENT_CREATE;
    try {
      const { tenantId, cohortId, contentId } = createCohortContentDto;

      // Check if record already exists for tenantId + cohortId + contentId
      const existing = await this.cohortContentRepository.findOne({
        where: { tenantId, cohortId, contentId },
      });

      if (existing) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.COHORT_CONTENT_EXISTS,
          HttpStatus.CONFLICT
        );
      }
      const cohortContentDetails = {
        ...createCohortContentDto,
        createdBy: createCohortContentDto.userId,
        updatedBy: createCohortContentDto.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const cohortContent =
        this.cohortContentRepository.create(cohortContentDetails);
      const result = await this.cohortContentRepository.save(cohortContent);

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.COHORT_CONTENT_CREATE
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
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

  async findAll(cohortId: string, response: Response): Promise<Response> {
    let apiId = APIID.COHORT_CONTENT_SEARCH;
    try {
      const cohortContent = await this.cohortContentRepository.find({
        where: { cohortId },
      });

      if (!cohortContent) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.COHORT_CONTENT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        cohortContent,
        HttpStatus.OK,
        API_RESPONSES.COHORT_CONTENT_LIST
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
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
    updateCohortContentDto: UpdateCohortContentDto,
    response: Response
  ): Promise<Response> {
    let apiId = APIID.COHORT_CONTENT_UPDATE;
    try {
      const { contentId, cohortId, tenantId, status } = updateCohortContentDto;

      const result = await this.cohortContentRepository.update(
        { contentId, cohortId, tenantId },
        { status: status, updatedAt: new Date() }
      );

      if (result.affected === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.COHORT_CONTENT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      const updatedCohortContent = await this.cohortContentRepository.findOne({
        where: { contentId, cohortId, tenantId },
      });

      return APIResponse.success(
        response,
        apiId,
        updatedCohortContent,
        HttpStatus.OK,
        API_RESPONSES.COHORT_CONTENT_UPDATE
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
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
  async search(filter: any, response: Response): Promise<Response> {
    let apiId = APIID.COHORT_CONTENT_SEARCH;
    try {
      // Allow only known searchable fields to avoid invalid queries
      const allowedFields = [
        "id",
        "contentId",
        "cohortId",
        "tenantId",
        "type",
        "createdBy",
        "updatedBy",
      ];

      const where: Record<string, any> = {};
      if (!filter || typeof filter !== "object") {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_PARAMETERS,
          HttpStatus.BAD_REQUEST
        );
      }

      for (const key of Object.keys(filter)) {
        if (allowedFields.includes(key) && filter[key] !== undefined) {
          where[key] = filter[key];
        }
      }

      if (Object.keys(where).length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_PARAMETERS,
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.cohortContentRepository.find({ where });

      if (!result || result.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.COHORT_CONTENT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.COHORT_CONTENT_LIST
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
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
