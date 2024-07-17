import { CohortMembersSearchDto } from "src/cohortMembers/dto/cohortMembers-search.dto";
import { CohortMembersDto } from "src/cohortMembers/dto/cohortMembers.dto";
import { CohortMembersUpdateDto } from "src/cohortMembers/dto/cohortMember-update.dto";
import { Response } from "express";
export interface IServicelocatorcohortMembers {
  createCohortMembers(
    loginUser: any,
    cohortMembersDto: CohortMembersDto,
    response: any,
    tenantId: string,
    deviceId: string
  );
  getCohortMembers(cohortMemberId: string, tenantId: string, fieldvalue: string, response: Response);
  searchCohortMembers(cohortMembersSearchDto: CohortMembersSearchDto, tenantId: string, response: Response);
  updateCohortMembers(
    cohortMembershipId: string,
    loginUser: any,
    cohortMemberUpdateDto: CohortMembersUpdateDto,

    response: any
  );
  deleteCohortMemberById(tenantid, cohortMembershipId, response);
  createBulkCohortMembers(loginUser, cohortMembersDto, response, tenantId);
}
