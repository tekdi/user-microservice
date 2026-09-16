import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ShortlistingLogger } from 'src/common/logger/ShortlistingLogger';

/**
 * LMS enrollment for cohort members.
 *
 * Enrolling a user into their cohort's courses is a consequence of the
 * membership reaching `shortlisted`, not of any one code path that happens to
 * put it there. It was originally private to PostgresCohortMembersService,
 * which meant the three paths through that adapter enrolled correctly while
 * PostgresUserService.saveUserToDatabase() - which writes CohortMembers rows
 * directly during user creation - silently did not.
 *
 * Lifting it here gives both adapters the same single implementation. It lives
 * outside both of them on purpose: the two adapters already depend on each
 * other (cohortMembers-adapter injects PostgresUserService), so hanging this
 * off either one would have closed that loop into a circular dependency. It
 * needs no repositories - only the LMS HTTP API and configuration - so it has
 * no reason to live in an adapter at all.
 *
 * Every method here swallows its own failures: LMS being unreachable must
 * never fail the surrounding user-creation or shortlisting flow, so problems
 * are logged to the shortlisting logs and the caller carries on.
 */
@Injectable()
export class LmsEnrollmentService {
  /**
   * Enrolls a shortlisted user to LMS courses for their cohort
   * Fetches all published courses for the cohort and enrolls the user
   *
   * @param userId - The user ID to enroll
   * @param cohortId - The cohort ID to get courses for
   * @returns Promise that resolves when enrollment is complete
   */
  public async enrollShortlistedUserToLMSCourses(
    userId: string,
    cohortId: string
  ) {
    try {
      const startTime = Date.now();

      // Log enrollment start
      ShortlistingLogger.logLMSEnrollmentStart({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
      });

      // Step 1: Fetch courses for the cohort
      const courses = await this.fetchLMSCoursesForCohort(cohortId);

      if (!courses || courses.length === 0) {
        ShortlistingLogger.logShortlisting(
          `No courses found for cohort ${cohortId}. Skipping LMS enrollment for user ${userId}`,
          'LMSEnrollment'
        );
        return;
      }
      // Update enrollment start log with course count
      ShortlistingLogger.logLMSEnrollmentStart({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseCount: courses.length,
      });

      // Step 2: Enroll user to all courses
      const enrollmentResults = await this.enrollUserToCourses(
        userId,
        courses,
        cohortId
      );

      // Log enrollment completion
      const processingTime = Date.now() - startTime;
      const successCount = enrollmentResults.filter(
        (r) => r.status === 'success'
      ).length;
      const failureCount = enrollmentResults.filter(
        (r) => r.status === 'failed'
      ).length;

      ShortlistingLogger.logLMSEnrollmentCompletion({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        totalCourses: courses.length,
        successfulEnrollments: successCount,
        failedEnrollments: failureCount,
        processingTime: processingTime,
      });
    } catch (error) {
      ShortlistingLogger.logShortlistingError(
        `Failed to enroll user ${userId} to LMS courses for cohort ${cohortId}`,
        error.message,
        'LMSEnrollment'
      );
      // Don't throw error to avoid breaking the shortlisting flow
    }
  }

  /**
   * Fetches LMS courses for a specific cohort
   * Makes API call to LMS service to get published courses
   *
   * @param cohortId - The cohort ID to fetch courses for
   * @returns Promise with array of courses or empty array if none found
   */
  public async fetchLMSCoursesForCohort(cohortId: string) {
    try {
      const lmsBaseUrl = process.env.LMS_SERVICE_URL;
      const tenantId = process.env.DEFAULT_TENANT_ID;
      const organisationId = process.env.DEFAULT_ORGANISATION_ID;

      if (!lmsBaseUrl || !tenantId || !organisationId) {
        throw new Error('LMS service configuration missing');
      }

      const requestUrl = `${lmsBaseUrl}/lms-service/v1/courses/search`;
      const requestParams = {
        status: 'published',
        cohortId: cohortId,
      };
      const requestHeaders = {
        tenantid: tenantId,
        organisationid: organisationId,
      };

      // Build the full URL with query parameters for logging
      const url = new URL(requestUrl);
      Object.keys(requestParams).forEach((key) => {
        url.searchParams.append(key, requestParams[key]);
      });
      const fullUrl = url.toString();

      const response = await axios.get(requestUrl, {
        params: requestParams,
        headers: requestHeaders,
      });

      // FIXED: Access the correct path for courses data
      const courses = response.data?.result?.courses || [];
      return courses;
    } catch (error) {
      ShortlistingLogger.logShortlistingError(
        `Failed to fetch LMS courses for cohort ${cohortId}`,
        error.message,
        'LMSEnrollment'
      );

      return [];
    }
  }

  /**
   * Enrolls a user to multiple courses in bulk
   * Makes API call to LMS service to create enrollments
   *
   * @param userId - The user ID to enroll
   * @param courses - Array of courses to enroll the user in
   * @returns Promise with enrollment results
   */
  private async enrollUserToCourses(
    userId: string,
    courses: any[],
    cohortId: string
  ): Promise<
    Array<{
      courseId: string;
      status: 'success' | 'failed';
      result?: any;
      error?: any;
    }>
  > {
    const lmsBaseUrl = process.env.LMS_SERVICE_URL;
    const tenantId = process.env.DEFAULT_TENANT_ID;
    const organisationId = process.env.DEFAULT_ORGANISATION_ID;

    const courseIds = courses
      .map((c) => c.courseId || c.id || c.course_id)
      .filter((id) => !!id);

    try {
      const requestUrl = `${lmsBaseUrl}/lms-service/v1/enrollments`;

      const requestBody = {
        courseId: courseIds,
        learnerId: userId,
        status: 'published',
      };
      const requestHeaders = {
        tenantid: tenantId,
        organisationid: organisationId,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(requestUrl, requestBody, {
        headers: requestHeaders,
        params: {
          userId: userId, // Add userId as query parameter as required by LMS service
        },
      });

      // Log successful enrollment for all courses in bulk
      ShortlistingLogger.logLMSEnrollmentSuccess({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseId: courseIds.join(','),
        enrollmentId: 'bulk', // response.data is an array now
      });

      // Map to the expected return format extracting individual course results
      const successfullyEnrolled = response.data?.successfullyEnrolled || [];
      const alreadyEnrolledCourseIds = response.data?.alreadyEnrolledCourseIds || [];
      const failedCourseIds = response.data?.failedCourseIds || [];

      return courseIds.map((id) => {
        if (failedCourseIds.includes(id)) {
          return {
            courseId: id,
            status: 'failed',
            error: 'LMS API reported failure for this course',
          };
        }
        if (alreadyEnrolledCourseIds.includes(id)) {
          // Previously, a 409 threw an error and was recorded as 'failed' in the loop
          return {
            courseId: id,
            status: 'failed',
            error: 'User already enrolled (409 Conflict)',
          };
        }

        const successMatch = successfullyEnrolled.find(
          (e: any) => e.courseId === id
        );
        return {
          courseId: id,
          status: 'success',
          result: successMatch || { status: 'PUBLISHED' },
        };
      });
    } catch (error) {
      // Log failed enrollment
      ShortlistingLogger.logLMSEnrollmentFailure({
        dateTime: new Date().toISOString(),
        userId: userId,
        cohortId: cohortId,
        courseId: courseIds.join(','),
        failureReason: error.message,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
      });

      return courseIds.map(id => ({
        courseId: id,
        status: 'failed',
        error: error.message,
      }));
    }
  }
}
