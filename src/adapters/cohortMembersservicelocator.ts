import { CohortMembersSearchDto } from 'src/cohortMembers/dto/cohortMembers-search.dto';
import { CohortMembersDto } from 'src/cohortMembers/dto/cohortMembers.dto';
import { CohortMembersUpdateDto } from 'src/cohortMembers/dto/cohortMember-update.dto';
import { Response } from 'express';

/**
 * Service locator interface for cohort members operations
 * Defines the contract for all cohort member-related database operations
 * Supports multiple database adapters (PostgreSQL, etc.) through dependency injection
 */
export interface IServicelocatorcohortMembers {
  /**
   * Creates a new cohort member
   * @param loginUser - The user ID of the person creating the cohort member
   * @param cohortMembersDto - Data transfer object containing cohort member information
   * @param response - Express response object
   * @param tenantId - The tenant ID for multi-tenancy
   * @param deviceId - The device ID for tracking
   * @param academicyearid - The academic year ID
   */
  createCohortMembers(
    loginUser: any,
    cohortMembersDto: CohortMembersDto,
    response: any,
    tenantId: string,
    deviceId: string,
    academicyearid: string
  );

  /**
   * Retrieves cohort member details by cohort ID
   * @param cohortMemberId - The cohort ID to fetch members for
   * @param tenantId - The tenant ID for multi-tenancy
   * @param fieldvalue - Whether to include custom field values
   * @param academicyearId - The academic year ID
   * @param response - Express response object
   */
  getCohortMembers(
    cohortMemberId: string,
    tenantId: string,
    fieldvalue: string,
    academicyearId: string,
    response: Response
  );

  /**
   * Searches for cohort members with filtering and pagination
   * @param cohortMembersSearchDto - Search criteria and pagination parameters
   * @param tenantId - The tenant ID for multi-tenancy
   * @param academicyearId - The academic year ID
   * @param response - Express response object
   */
  searchCohortMembers(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    academicyearId: string,
    response: Response
  );

  /**
   * Updates an existing cohort member
   * @param cohortMembershipId - The cohort membership ID to update
   * @param loginUser - The user ID of the person making the update
   * @param cohortMemberUpdateDto - Data transfer object containing update information
   * @param response - Express response object
   */
  updateCohortMembers(
    cohortMembershipId: string,
    loginUser: any,
    cohortMemberUpdateDto: CohortMembersUpdateDto,
    response: any
  );

  /**
   * Deletes a cohort member by ID
   * @param tenantid - The tenant ID for multi-tenancy
   * @param cohortMembershipId - The cohort membership ID to delete
   * @param response - Express response object
   */
  deleteCohortMemberById(tenantid, cohortMembershipId, response);

  /**
   * Creates multiple cohort members in bulk
   * @param loginUser - The user ID of the person creating the cohort members
   * @param cohortMembersDto - Data transfer object containing bulk cohort member information
   * @param response - Express response object
   * @param tenantId - The tenant ID for multi-tenancy
   * @param academicyearId - The academic year ID
   */
  createBulkCohortMembers(
    loginUser,
    cohortMembersDto,
    response,
    tenantId,
    academicyearId: string
  );

  /**
   * Lists cohort members with their associated application forms
   * @param cohortMembersSearchDto - Search criteria and pagination parameters
   * @param tenantId - The tenant ID for multi-tenancy
   * @param academicyearId - The academic year ID
   * @param response - Express response object
   */
  listWithApplication(
    cohortMembersSearchDto: CohortMembersSearchDto,
    tenantId: string,
    academicyearId: string,
    response: Response
  );

  /**
   * Evaluates cohort member shortlisting status based on form rules
   *
   * This method implements a high-performance, automated evaluation system that:
   * 1. Fetches active cohorts with shortlist dates matching today
   * 2. Processes submitted members in parallel batches for optimal performance
   * 3. Evaluates form rules against user field values
   * 4. Updates member status to 'shortlisted' or 'rejected'
   * 5. Sends email notifications based on evaluation results
   * 6. Logs failures for manual review
   *
   * Performance Features:
   * - Handles 100,000+ records per cohort with optimized parallel processing
   * - Configurable batch size and concurrency for performance tuning
   * - Real-time performance monitoring and metrics
   * - Graceful error handling with detailed failure logging
   *
   * @param tenantId - The tenant ID for the evaluation context
   * @param academicyearId - The academic year ID for the evaluation context
   * @param userId - The user ID from the authenticated request
   * @param response - Express response object for API response
   * @returns Promise with evaluation results and performance metrics
   */
  evaluateCohortMemberShortlistingStatus(
    tenantId: string,
    academicyearId: string,
    userId: string,
    response: Response
  );
}
