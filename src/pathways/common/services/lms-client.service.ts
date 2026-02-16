import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

export interface VideoResourceCounts {
  videoCount: number;
  resourceCount: number;
  totalItems: number; // Total count of all lessons
}

export interface PathwayCounts {
  pathwayId: string;
  videoCount: number;
  resourceCount: number;
}

/**
 * Service to interact with LMS service for course-related operations
 * Handles fetching video and resource counts for pathways
 */
@Injectable()
export class LmsClientService {
  private readonly logger = new Logger(LmsClientService.name);
  private readonly lmsServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.lmsServiceUrl = this.configService.get<string>('LMS_SERVICE_URL');
    if (!this.lmsServiceUrl) {
      this.logger.warn('LMS_SERVICE_URL not configured. Counts will return 0.');
    }
  }

  /**
   * Get video and resource counts for a single pathway
   * OPTIMIZED:
   * 1. First gets all courses for pathwayId using search API
   * 2. Then fetches hierarchy for each course in parallel to get modules and lessons
   * 3. Counts videos (format='video') and total lessons (as resources)
   *
   * @param pathwayId - Pathway ID to get counts for
   * @param tenantId - Tenant ID
   * @param organisationId - Organisation ID
   * @returns Video and resource counts, or {0, 0} on error
   */
  async getVideoAndResourceCounts(
    pathwayId: string,
    tenantId: string,
    organisationId: string
  ): Promise<VideoResourceCounts> {
    if (!this.lmsServiceUrl) {
      this.logger.warn(
        `LMS_SERVICE_URL not configured. Returning 0 counts for pathway ${pathwayId}`
      );
      return { videoCount: 0, resourceCount: 0, totalItems: 0 };
    }

    try {
      // Step 1: Get all courses for this pathwayId with pagination
      // FIXED: Implement pagination loop to fetch all courses, not just first 1000
      const searchUrl = `${this.lmsServiceUrl}/lms-service/v1/courses/search`;
      const headers = {
        tenantid: tenantId,
        organisationid: organisationId,
        'Content-Type': 'application/json',
      };

      this.logger.debug(
        `Fetching courses for pathway ${pathwayId} from LMS service`
      );

      // Pagination parameters with safety guards
      const limit = 1000; // Maximum per request
      const MAX_PAGES = 100; // Safety guard: Maximum 100 pages (100,000 courses)
      const MAX_COURSES = 100000; // Absolute maximum courses to fetch
      let offset = 0;
      let allCourses: any[] = [];
      let totalElements = 0;
      let hasMore = true;
      let pageCount = 0;
      let previousCourseCount = 0;

      // Fetch all courses in paginated loop with safety guards
      while (hasMore) {
        // SAFETY GUARD 1: Maximum page limit to prevent infinite loops
        if (pageCount >= MAX_PAGES) {
          this.logger.warn(
            `Pagination safety guard triggered: Reached maximum page limit (${MAX_PAGES}) for pathway ${pathwayId}. Fetched ${allCourses.length} courses.`
          );
          break;
        }

        // SAFETY GUARD 2: Maximum total courses limit
        if (allCourses.length >= MAX_COURSES) {
          this.logger.warn(
            `Pagination safety guard triggered: Reached maximum course limit (${MAX_COURSES}) for pathway ${pathwayId}.`
          );
          break;
        }

        const searchParams = {
          pathwayId: pathwayId,
          status: 'published',
          limit: limit,
          offset: offset,
        };

        const searchResponse = await axios.get(searchUrl, {
          params: searchParams,
          headers,
          timeout: 10000,
          validateStatus: (status) => status < 500,
        });

        if (searchResponse.status !== 200) {
          this.logger.warn(
            `LMS service returned status ${searchResponse.status} for pathway ${pathwayId} at offset ${offset}. Returning partial counts.`
          );
          // If we have some courses, continue with what we have
          if (allCourses.length === 0) {
            return { videoCount: 0, resourceCount: 0, totalItems: 0 };
          }
          break;
        }

        // Extract courses and pagination metadata from response
        const responseData = searchResponse.data?.result || searchResponse.data;
        const courses = responseData?.courses || [];
        totalElements = responseData?.totalElements || 0;

        // SAFETY GUARD 3: No progress detection - if we get 0 courses, break to prevent infinite loop
        if (courses.length === 0) {
          this.logger.debug(
            `No courses returned at offset ${offset} for pathway ${pathwayId}. Ending pagination.`
          );
          break;
        }

        // SAFETY GUARD 4: Detect if we're getting duplicate/unchanged results
        // (indicates API might be ignoring offset parameter)
        if (courses.length > 0 && allCourses.length > 0) {
          const firstCourseId = courses[0]?.courseId || courses[0]?.id;
          const lastFetchedCourseId = allCourses[allCourses.length - 1]?.courseId || allCourses[allCourses.length - 1]?.id;
          if (firstCourseId === lastFetchedCourseId) {
            this.logger.warn(
              `Pagination safety guard triggered: Detected duplicate results at offset ${offset} for pathway ${pathwayId}. API may be ignoring offset parameter. Breaking pagination.`
            );
            break;
          }
        }

        // Add courses to collection
        allCourses = allCourses.concat(courses);
        pageCount++;
        previousCourseCount = allCourses.length;

        // Check if there are more courses to fetch
        // Continue if: we got a full page AND (totalElements is unknown OR offset + limit < totalElements)
        hasMore =
          courses.length === limit &&
          (totalElements === 0 || offset + limit < totalElements);

        if (hasMore) {
          offset += limit;
          this.logger.debug(
            `Fetched ${allCourses.length} courses (page ${pageCount}) for pathway ${pathwayId}, continuing...`
          );
        }
      }

      if (allCourses.length === 0) {
        this.logger.debug(`No courses found for pathway ${pathwayId}`);
        return { videoCount: 0, resourceCount: 0, totalItems: 0 };
      }

      this.logger.debug(
        `Fetched total ${allCourses.length} courses for pathway ${pathwayId} (totalElements: ${totalElements})`
      );

      const courses = allCourses;
      // Extract course IDs - check both courseId and id fields
      // Validate UUID format to ensure we're sending valid IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const courseIds = courses
        .map((course: any) => {
          const id = course.courseId || course.id || course.course_id;
          return id;
        })
        .filter(Boolean)
        .filter((id) => typeof id === 'string' && id.length > 0)
        .filter((id) => uuidRegex.test(id)); // Only include valid UUIDs

      if (courseIds.length === 0) {
        this.logger.warn(
          `No valid course IDs found for pathway ${pathwayId}. Course structure sample: ${JSON.stringify(courses[0] || {})}`
        );
        return { videoCount: 0, resourceCount: 0, totalItems: 0 };
      }

      this.logger.debug(
        `Extracted ${courseIds.length} valid course IDs for pathway ${pathwayId}: ${courseIds.slice(0, 3).join(', ')}${courseIds.length > 3 ? '...' : ''}`
      );

      // Step 2: OPTIMIZED - Use direct lesson count API instead of fetching hierarchy
      // This is much faster as it queries the database directly
      const countsMap = await this.getLessonCountsByCourseIds(courseIds, tenantId, organisationId, headers);

      // Step 3: Aggregate counts across all courses
      let videoCount = 0;
      let resourceCount = 0;
      let totalItems = 0;

      countsMap.forEach((counts) => {
        videoCount += counts.videoCount;
        resourceCount += counts.resourceCount;
        totalItems += counts.totalItems;
      });

      this.logger.debug(
        `Pathway ${pathwayId}: ${videoCount} videos, ${resourceCount} resources (documents), ${totalItems} total items`
      );

      return { videoCount, resourceCount, totalItems };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to fetch counts for pathway ${pathwayId} from LMS service: ${errorMessage}`
      );

      // Return 0 counts on error to not break pathways list API
      return { videoCount: 0, resourceCount: 0, totalItems: 0 };
    }
  }

  /**
   * Get lesson counts for multiple courses using optimized direct database query
   * Calls: GET /courses/lesson-counts?courseIds=id1,id2,id3
   * 
   * OPTIMIZED: This is much faster than fetching hierarchy for each course
   *
   * @param courseIds - Array of course IDs
   * @param tenantId - Tenant ID
   * @param organisationId - Organisation ID
   * @param headers - Request headers
   * @returns Map of courseId to counts
   */
  private async getLessonCountsByCourseIds(
    courseIds: string[],
    tenantId: string,
    organisationId: string,
    headers: Record<string, string>
  ): Promise<Map<string, { videoCount: number; resourceCount: number; totalItems: number }>> {
    if (courseIds.length === 0) {
      return new Map();
    }

    try {
      const countsUrl = `${this.lmsServiceUrl}/lms-service/v1/courses/lesson-counts`;
      const courseIdsParam = courseIds.join(',');

      this.logger.debug(
        `Calling lesson-counts API with ${courseIds.length} course IDs: ${courseIdsParam.substring(0, 100)}${courseIdsParam.length > 100 ? '...' : ''}`
      );

      const countsResponse = await axios.get(countsUrl, {
        params: { courseIds: courseIdsParam },
        headers,
        timeout: 10000,
        validateStatus: (status) => status < 500,
      });

      if (countsResponse.status !== 200) {
        // Extract error message from different possible response structures
        const errorData = countsResponse.data;
        const errorMessage = 
          errorData?.message || 
          errorData?.errmsg || 
          errorData?.params?.errmsg ||
          errorData?.error ||
          JSON.stringify(errorData) ||
          'Unknown error';
        
        this.logger.warn(
          `Failed to fetch lesson counts: status ${countsResponse.status}, error: ${errorMessage}. Request: courseIds=${courseIdsParam.substring(0, 200)}${courseIdsParam.length > 200 ? '...' : ''}`
        );
        
        // Return map with zero counts for all courses
        const zeroCountsMap = new Map<string, { videoCount: number; resourceCount: number; totalItems: number }>();
        courseIds.forEach((courseId) => {
          zeroCountsMap.set(courseId, { videoCount: 0, resourceCount: 0, totalItems: 0 });
        });
        return zeroCountsMap;
      }

      // Convert response object to Map
      // Handle both direct response and wrapped in 'result' object
      const responseData = countsResponse.data?.result || countsResponse.data || {};
      const countsMap = new Map<string, { videoCount: number; resourceCount: number; totalItems: number }>();

      courseIds.forEach((courseId) => {
        const counts = responseData[courseId] || { videoCount: 0, resourceCount: 0, totalItems: 0 };
        countsMap.set(courseId, counts);
      });

      this.logger.debug(
        `Successfully fetched lesson counts for ${countsMap.size} courses`
      );

      return countsMap;
    } catch (error) {
      this.logger.warn(
        `Error fetching lesson counts: ${error instanceof Error ? error.message : 'Unknown error'}. Returning zero counts.`
      );
      // Return map with zero counts for all courses on error
      const zeroCountsMap = new Map<string, { videoCount: number; resourceCount: number; totalItems: number }>();
      courseIds.forEach((courseId) => {
        zeroCountsMap.set(courseId, { videoCount: 0, resourceCount: 0, totalItems: 0 });
      });
      return zeroCountsMap;
    }
  }

  /**
   * Batch fetch video and resource counts for multiple pathways
   * OPTIMIZED: Fetches all counts in parallel using Promise.all
   *
   * @param pathwayIds - Array of pathway IDs to get counts for
   * @param tenantId - Tenant ID
   * @param organisationId - Organisation ID
   * @returns Map of pathwayId to counts
   */
  async getBatchCounts(
    pathwayIds: string[],
    tenantId: string,
    organisationId: string
  ): Promise<Map<string, VideoResourceCounts>> {
    if (pathwayIds.length === 0) {
      return new Map();
    }

    // OPTIMIZED: Fetch all counts in parallel (no sequential calls)
    const countPromises = pathwayIds.map((pathwayId) =>
      this.getVideoAndResourceCounts(pathwayId, tenantId, organisationId).then(
        (counts) => ({ pathwayId, counts })
      )
    );

    try {
      const results = await Promise.all(countPromises);
      const countsMap = new Map<string, VideoResourceCounts>();

      results.forEach(({ pathwayId, counts }) => {
        countsMap.set(pathwayId, counts);
      });

      return countsMap;
    } catch (error) {
      this.logger.error(
        `Error in batch fetch counts: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      // Return map with 0 counts for all pathways
      const countsMap = new Map<string, VideoResourceCounts>();
      pathwayIds.forEach((pathwayId) => {
        countsMap.set(pathwayId, {
          videoCount: 0,
          resourceCount: 0,
          totalItems: 0,
        });
      });
      return countsMap;
    }
  }
}
