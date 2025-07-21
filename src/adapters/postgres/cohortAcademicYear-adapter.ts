import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { Repository } from "typeorm";
import { IServiceLocatorCohortAcademicYear } from "../cohortacademicyearservicelocator";
import { Request, Response } from "express";
import { CohortAcademicYearDto } from "src/cohortAcademicYear/dto/cohort-academicyear.dto";
import { APIID } from "@utils/api-id.config";
import APIResponse from "src/common/responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { PostgresAcademicYearService } from "./academicyears-adapter";
import { Cohort } from "src/cohort/entities/cohort.entity";

@Injectable()
export class CohortAcademicYearService
  implements IServiceLocatorCohortAcademicYear
{
  constructor(
    private readonly postgresAcademicYearService: PostgresAcademicYearService,
    @InjectRepository(Cohort)
    private readonly cohortRepository: Repository<Cohort>,
    @InjectRepository(CohortAcademicYear)
    private readonly cohortAcademicYearRepository: Repository<CohortAcademicYear>,
  ) {}

  async createCohortAcademicYear(
    tenantId: string,
    request: Request,
    cohortAcademicYearDto: CohortAcademicYearDto,
    response: Response,
  ) {
    const apiId = APIID.ADD_COHORT_TO_ACADEMIC_YEAR;
    try {
      const existingCohort = await this.cohortRepository.findOne({
        where: { cohortId: cohortAcademicYearDto.cohortId, status: "active" },
      });

      if (!existingCohort) {
        return APIResponse.error(
          response,
          apiId,
          HttpStatus.NOT_FOUND.toLocaleString(),
          API_RESPONSES.COHORT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      if (existingCohort.tenantId !== tenantId) {
        return APIResponse.error(
          response,
          apiId,
          HttpStatus.BAD_REQUEST.toLocaleString(),
          API_RESPONSES.TENANTID_MISMATCHED,
          HttpStatus.BAD_REQUEST,
        );
      }

      // verify if the academic year id is valid
      const academicYear =
        await this.postgresAcademicYearService.getActiveAcademicYear(
          cohortAcademicYearDto.academicYearId,
          tenantId,
        );

      if (!academicYear) {
        return APIResponse.error(
          response,
          apiId,
          HttpStatus.NOT_FOUND.toLocaleString(),
          API_RESPONSES.ACADEMICYEAR_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const createdAcademicYear = await this.insertCohortAcademicYear(
        cohortAcademicYearDto.cohortId,
        cohortAcademicYearDto.academicYearId,
        cohortAcademicYearDto.createdBy,
        cohortAcademicYearDto.updatedBy,
      );

      if (createdAcademicYear) {
        return APIResponse.success(
          response,
          apiId,
          createdAcademicYear,
          HttpStatus.OK,
          API_RESPONSES.ADD_COHORT_TO_ACADEMIC_YEAR,
        );
      }
    } catch (error) {
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async insertCohortAcademicYear(
    cohortId: string,
    academicYearId: string,
    createdBy: string,
    updatedBy: string,
  ) {
    const cohortAcademicYear = new CohortAcademicYear();
    cohortAcademicYear.cohortId = cohortId;
    cohortAcademicYear.academicYearId = academicYearId;
    cohortAcademicYear.createdBy = createdBy;
    cohortAcademicYear.updatedBy = updatedBy;
    return await this.cohortAcademicYearRepository.save(cohortAcademicYear);
  }

  async getCohortsAcademicYear(
    academicYearId: string,
    tenantId: string,
  ): Promise<CohortAcademicYear[]> {
    const query = `
      SELECT cay.*
      FROM public."CohortAcademicYear" cay
      INNER JOIN public."AcademicYears" ay
        ON cay."academicYearId" = ay."id"
      WHERE cay."academicYearId" = $1
        AND ay."tenantId" = $2`;

    return await this.cohortAcademicYearRepository.query(query, [
      academicYearId,
      tenantId,
    ]);
  }

  async isCohortExistForYear(yearId, cohortId) {
    return await this.cohortAcademicYearRepository.find({
      where: { academicYearId: yearId, cohortId: cohortId },
    });
  }
}
