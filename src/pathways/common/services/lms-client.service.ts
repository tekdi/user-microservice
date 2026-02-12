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

      // Step 2: Fetch hierarchy for each course in parallel to get modules and lessons
      // OPTIMIZED: Fetch all hierarchies in parallel
      const hierarchyPromises = courses.map((course: any) =>
        this.getCourseHierarchy(
          course.courseId || course.id,
          tenantId,
          organisationId,
          headers
        )
      );

      const hierarchies = await Promise.allSettled(hierarchyPromises);

      // Step 3: Count videos, resources (documents), and total items from all course hierarchies
      let videoCount = 0;
      let resourceCount = 0; // Count of lessons with format = 'document'
      let totalItems = 0; // Total count of all lessons

      for (const result of hierarchies) {
        if (result.status === 'fulfilled' && result.value) {
          const hierarchy = result.value;

          // Process modules and lessons
          if (hierarchy.modules && Array.isArray(hierarchy.modules)) {
            for (const module of hierarchy.modules) {
              if (module.lessons && Array.isArray(module.lessons)) {
                for (const lesson of module.lessons) {
                  // Only count published lessons
                  if (lesson.status === 'published') {
                    // Count total items: all published lessons
                    totalItems++;

                    // Count videos: lessons with format = 'video'
                    if (lesson.format === 'video') {
                      videoCount++;
                    }

                    // Count resources: lessons with format = 'document'
                    if (lesson.format === 'document') {
                      resourceCount++;
                    }
                  }
                }
              }
            }
          }
        } else if (result.status === 'rejected') {
          this.logger.warn(
            `Failed to fetch hierarchy for a course: ${
              result.reason?.message || 'Unknown error'
            }`
          );
        }
      }

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
   * Get course hierarchy with modules and lessons
   * Calls: GET /courses/{courseId}/hierarchy?includeModules=true&includeLessons=true
   *
   * @param courseId - Course ID
   * @param tenantId - Tenant ID
   * @param organisationId - Organisation ID
   * @param headers - Request headers
   * @returns Course hierarchy with modules and lessons, or null on error
   */
  private async getCourseHierarchy(
    courseId: string,
    tenantId: string,
    organisationId: string,
    headers: Record<string, string>
  ): Promise<Record<string, unknown> | null> {
    try {
      const hierarchyUrl = `${this.lmsServiceUrl}/lms-service/v1/courses/${courseId}/hierarchy`;
      const hierarchyParams = {
        includeModules: 'true',
        includeLessons: 'true',
      };

      const hierarchyResponse = await axios.get(hierarchyUrl, {
        params: hierarchyParams,
        headers,
        timeout: 10000,
        validateStatus: (status) => status < 500,
      });

      if (hierarchyResponse.status !== 200) {
        this.logger.warn(
          `Failed to fetch hierarchy for course ${courseId}: status ${hierarchyResponse.status}`
        );
        return null;
      }

      // Extract hierarchy from response
      return hierarchyResponse.data?.result || hierarchyResponse.data || null;
    } catch (error) {
      this.logger.warn(
        `Error fetching hierarchy for course ${courseId}: ${
          axios.isAxiosError(error) ? error.message : 'Unknown error'
        }`
      );
      return null;
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
