import { CohortCreateDto } from "src/cohort/dto/cohort-create.dto";
import { CohortUpdateDto } from "src/cohort/dto/cohort-update.dto";
import { CohortSearchDto } from "src/cohort/dto/cohort-search.dto";
import { CohortDto } from "src/cohort/dto/cohort.dto";
import { Response } from "express";

export interface IServicelocatorcohort {
  getCohortsDetails(requiredData,response);
  createCohort(request: any, cohortDto: CohortCreateDto,response);
  searchCohort(tenantid, request: any, cohortSearchDto: CohortSearchDto,response);
  updateCohort(cohortId: string, request: any, cohortUpdateDto: CohortUpdateDto,response);
  updateCohortStatus(cohortId: string, request: any,response);
  getCohortHierarchyData(requiredData,response)
}
