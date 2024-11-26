import { CohortCreateDto } from "src/cohort/dto/cohort-create.dto";
import { CohortUpdateDto } from "src/cohort/dto/cohort-update.dto";
import { CohortSearchDto } from "src/cohort/dto/cohort-search.dto";
import { CohortDto } from "src/cohort/dto/cohort.dto";
import { Response } from "express";

export interface IServicelocatorcohort {
  getCohortsDetails(requiredData, response);
  createCohort(cohortDto: CohortCreateDto, response);
  searchCohort(
    tenantid: string,
    academicYearId: string,
    cohortSearchDto: CohortSearchDto,
    response
  );
  updateCohort(cohortId: string, cohortUpdateDto: CohortUpdateDto, response);
  updateCohortStatus(cohortId: string, response, userId: string);
  getCohortHierarchyData(requiredData, response);
}
