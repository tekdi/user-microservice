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
      // Step 1: Get all courses for this pathwayId
      const searchUrl = `${this.lmsServiceUrl}/lms-service/v1/courses/search`;
      const searchParams = {
        pathwayId: pathwayId,
        status: 'published',
        limit: 1000, // Get all courses
        offset: 0,
      };

      const headers = {
        tenantid: tenantId,
        organisationid: organisationId,
        'Content-Type': 'application/json',
      };

      this.logger.debug(
        `Fetching courses for pathway ${pathwayId} from LMS service`
      );

      const searchResponse = await axios.get(searchUrl, {
        params: searchParams,
        headers,
        timeout: 10000,
        validateStatus: (status) => status < 500,
      });

      if (searchResponse.status !== 200) {
        this.logger.warn(
          `LMS service returned status ${searchResponse.status} for pathway ${pathwayId}. Returning 0 counts.`
        );
        return { videoCount: 0, resourceCount: 0, totalItems: 0 };
      }

      // Extract courses from response
      const courses =
        searchResponse.data?.result?.courses ||
        searchResponse.data?.courses ||
        [];

      if (courses.length === 0) {
        this.logger.debug(`No courses found for pathway ${pathwayId}`);
        return { videoCount: 0, resourceCount: 0, totalItems: 0 };
      }

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
      let errorMessage = 'Unknown error';
      if (axios.isAxiosError(error)) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

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
