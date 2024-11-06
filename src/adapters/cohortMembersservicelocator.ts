import { CohortMembersSearchDto } from "src/cohortMembers/dto/cohortMembers-search.dto";
import { CohortMembersDto } from "src/cohortMembers/dto/cohortMembers.dto";
import { CohortMembersUpdateDto } from "src/cohortMembers/dto/cohortMember-update.dto";
import { Response } from "express";
import { RegisterForBoardEnrolmentDto } from "src/cohortMembers/dto/registerBoardEnrolment_create.dto";
export interface IServicelocatorcohortMembers {
  createCohortMembers(
    loginUser: any,
    cohortMembersDto: CohortMembersDto,
    response: any,
    tenantId: string,
    deviceId: string,
    academicyearid: string
  );
  getCohortMembers(
    cohortMemberId: string,
    tenantId: string,
    fieldvalue: string,
    academicyearId: string,
    response: Response
  );
  searchCohortMembers(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    academicyearId: string,
    response: Response
  );
  updateCohortMembers(
    cohortMembershipId: string,
    loginUser: any,
    cohortMemberUpdateDto: CohortMembersUpdateDto,

    response: any
  );
  deleteCohortMemberById(tenantid, cohortMembershipId, response);
  createBulkCohortMembers(
    loginUser,
    cohortMembersDto,
    response,
    tenantId,
    academicyearId: string
  );
  registerForBoardEnrolment(
    loggedInUserId: string,
    registerForBoardEnrolmentDto: RegisterForBoardEnrolmentDto,
    response: Response,
    tenantId: string,
    academicyearId: string
  );
  getRegistrationDetailsForBoardEnrolment(
    cohortMembershipId: string,
    response: Response
  );
}
