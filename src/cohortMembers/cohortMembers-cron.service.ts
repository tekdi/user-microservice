import { Injectable, Logger } from "@nestjs/common";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";
import { LoggerUtil } from "src/common/logger/LoggerUtil";

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
   * 
   * NOTE: This internal cron job is DISABLED because an external cron job is being used
   * that calls the API endpoint directly with proper tenant/academic year/user context.
   */

  // Configuration flag to enable/disable internal cron job
  private static readonly INTERNAL_CRON_ENABLED = false;
  // @Cron(CronExpression.EVERY_DAY_AT_2AM, { disabled: !CohortMembersCronService.INTERNAL_CRON_ENABLED })
  async handleCohortMemberShortlistingEvaluation() {
    const startTime = Date.now();

    try {
      this.logger.log(
        "Starting scheduled cohort member shortlisting evaluation"
      );

      // Get tenant and academic year from environment variables
      // These must be configured for the automated cron job to work properly
      const tenantId = process.env.DEFAULT_TENANT_ID;
      const academicYearId = process.env.DEFAULT_ACADEMIC_YEAR_ID;
      const systemUserId = process.env.SYSTEM_USER_ID;

      // Validate that required environment variables are set
      if (!tenantId) {
        const error = "DEFAULT_TENANT_ID environment variable is not configured. Cron job cannot proceed.";
        this.logger.error(error);
        LoggerUtil.error(
          "Scheduled shortlisting evaluation failed - missing configuration",
          error,
          "CohortMembersCron"
        );
        return;
      }

      if (!academicYearId) {
        const error = "DEFAULT_ACADEMIC_YEAR_ID environment variable is not configured. Cron job cannot proceed.";
        this.logger.error(error);
        LoggerUtil.error(
          "Scheduled shortlisting evaluation failed - missing configuration",
          error,
          "CohortMembersCron"
        );
        return;
      }

      if (!systemUserId) {
        const error = "SYSTEM_USER_ID environment variable is not configured. Cron job cannot proceed.";
        this.logger.error(error);
        LoggerUtil.error(
          "Scheduled shortlisting evaluation failed - missing configuration",
          error,
          "CohortMembersCron"
        );
        return;
      }

      // Call the evaluation service with configured parameters using the internal method
      const result =
        await this.cohortMembersService.evaluateCohortMemberShortlistingStatusInternal(
          tenantId,
          academicYearId,
          systemUserId // Use configured system user ID
        );

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `Scheduled shortlisting evaluation completed in ${processingTime}ms. Result: ${JSON.stringify(
          result
        )}`
      );

      // Log success metrics for monitoring
      LoggerUtil.log(
        "Scheduled shortlisting evaluation completed successfully",
        `Processing time: ${processingTime}ms, Result: ${JSON.stringify(
          result
        )}`,
        "CohortMembersCron"
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error(
        `Scheduled shortlisting evaluation failed after ${processingTime}ms: ${error.message}`,
        error.stack
      );

      // Log error for monitoring and alerting
      LoggerUtil.error(
        "Scheduled shortlisting evaluation failed",
        `Error: ${error.message}, Processing time: ${processingTime}ms`,
        "CohortMembersCron"
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
   * @param batchSize - Optional batch size for processing (overrides environment variable)
   * @param userIds - Optional array of user IDs to filter processing (only these users will be processed)
   * @returns Promise with evaluation results
   */
  async triggerShortlistingEvaluation(
    tenantId: string,
    academicYearId: string,
    userId: string,
    batchSize?: number,
    userIds?: string[]
  ): Promise<any> {
    this.logger.log(
      `Manual trigger of shortlisting evaluation for tenant: ${tenantId}, academic year: ${academicYearId}, user: ${userId}, batchSize: ${batchSize || 'default'}, userIds filter: ${userIds ? userIds.length + ' users' : 'all users'}`
    );

    try {
      // Call the evaluation service with provided parameters using the internal method
      const result =
        await this.cohortMembersService.evaluateCohortMemberShortlistingStatusInternal(
          tenantId,
          academicYearId,
          userId,
          batchSize,
          userIds
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

  /**
   * Manual trigger method for rejection email notification processing
   * Can be called programmatically for testing or immediate processing
   *
   * @param tenantId - The tenant ID for the evaluation
   * @param academicYearId - The academic year ID for the evaluation
   * @param userId - The user ID from the authenticated request
   * @returns Promise with processing results
   */
  async triggerRejectionEmailNotification(
    tenantId: string,
    academicYearId: string,
    userId: string
  ): Promise<any> {
    this.logger.log(
      `Manual trigger of rejection email notification for tenant: ${tenantId}, academic year: ${academicYearId}, user: ${userId}`
    );

    try {
      // Call the rejection email service with provided parameters using the internal method
      const result =
        await this.cohortMembersService.sendRejectionEmailNotificationsInternal(
          tenantId,
          academicYearId,
          userId
        );

      this.logger.log(`Manual rejection email notification completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Manual rejection email notification failed: ${error.message}`,
        error.stack
      );

      // Re-throw the error to be handled by the controller
      throw error;
    }
  }
}
