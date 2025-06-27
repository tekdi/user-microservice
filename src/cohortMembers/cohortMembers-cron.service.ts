import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostgresCohortMembersService } from 'src/adapters/postgres/cohortMembers-adapter';
import { Response } from 'express';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';

/**
 * Service responsible for automated cohort member shortlisting evaluation
 * Runs scheduled cron jobs to evaluate and update member statuses based on form rules
 */
@Injectable()
export class CohortMembersCronService {
  private readonly logger = new Logger(CohortMembersCronService.name);

  constructor(
    private readonly cohortMembersService: PostgresCohortMembersService
  ) {}

  /**
   * Scheduled cron job that runs daily at 2 AM to evaluate cohort member shortlisting status
   * Processes all active cohorts with shortlist dates matching today's date
   *
   * Cron Expression: '0 2 * * *' (Every day at 2:00 AM)
   *
   * The job:
   * 1. Fetches active cohorts with shortlist date = today
   * 2. Processes each cohort's submitted members
   * 3. Evaluates form rules against user field values
   * 4. Updates member status to 'shortlisted' or 'rejected'
   * 5. Sends email notifications based on results
   * 6. Logs failures for manual review
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCohortMemberShortlistingEvaluation() {
    const startTime = Date.now();

    try {
      this.logger.log(
        'Starting scheduled cohort member shortlisting evaluation'
      );

      // Get default tenant and academic year from environment variables
      // These should be configured for the automated cron job
      const defaultTenantId =
        process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
      const defaultAcademicYearId =
        process.env.DEFAULT_ACADEMIC_YEAR_ID ||
        '00000000-0000-0000-0000-000000000000';

      // Create a mock response object for the service call
      const mockResponse = {
        status: (code: number) => mockResponse,
        json: (data: any) => data,
      } as Response;

      // Call the evaluation service with default parameters
      const result =
        await this.cohortMembersService.evaluateCohortMemberShortlistingStatus(
          defaultTenantId,
          defaultAcademicYearId,
          '00000000-0000-0000-0000-000000000001', // Default system user for scheduled jobs
          mockResponse
        );

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `Scheduled shortlisting evaluation completed in ${processingTime}ms. Result: ${JSON.stringify(
          result
        )}`
      );

      // Log success metrics for monitoring
      LoggerUtil.log(
        'Scheduled shortlisting evaluation completed successfully',
        `Processing time: ${processingTime}ms, Result: ${JSON.stringify(
          result
        )}`,
        'CohortMembersCron'
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error(
        `Scheduled shortlisting evaluation failed after ${processingTime}ms: ${error.message}`,
        error.stack
      );

      // Log error for monitoring and alerting
      LoggerUtil.error(
        'Scheduled shortlisting evaluation failed',
        `Error: ${error.message}, Processing time: ${processingTime}ms`,
        'CohortMembersCron'
      );
    }
  }

  /**
   * Manual trigger method for cohort member shortlisting evaluation
   * Can be called programmatically for testing or immediate processing
   *
   * @param tenantId - The tenant ID for the evaluation
   * @param academicYearId - The academic year ID for the evaluation
   * @param userId - The user ID from the authenticated request
   * @param res - Express response object
   * @returns Promise with evaluation results
   */
  async triggerShortlistingEvaluation(
    tenantId: string,
    academicYearId: string,
    userId: string,
    res: Response
  ): Promise<any> {
    this.logger.log(
      `Manual trigger of shortlisting evaluation for tenant: ${tenantId}, academic year: ${academicYearId}, user: ${userId}`
    );

    try {
      // Call the evaluation service with provided parameters
      const result =
        await this.cohortMembersService.evaluateCohortMemberShortlistingStatus(
          tenantId,
          academicYearId,
          userId,
          res
        );

      this.logger.log(`Manual shortlisting evaluation completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Manual shortlisting evaluation failed: ${error.message}`,
        error.stack
      );

      // Re-throw the error to be handled by the controller
      throw error;
    }
  }
}
