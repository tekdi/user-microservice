import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '../utils/http-service';
import { ConfigService } from '@nestjs/config';

export interface LMSCourse {
  courseId: string;
  courseTitle: string;
  progress: number;
  units: {
    type: 'nested';
    values: LMSUnit[];
  };
}

export interface LMSUnit {
  unitId: string;
  unitTitle: string;
  progress: number;
  contents: {
    type: 'nested';
    values: LMSContent[];
  };
}

export interface LMSContent {
  contentId: string;
  type: string;
  title: string;
  status: string;
  tracking: {
    percentComplete?: number;
    lastPosition?: number;
    currentPosition?: number;
    timeSpent?: number;
    visitedPages?: number[];
    totalPages?: number;
    lastPage?: number;
    currentPage?: number;
    questionsAttempted?: number;
    totalQuestions?: number;
    score?: number;
    answers?: {
      type: 'nested';
      values: {
        questionId: string;
        type: string;
        submittedAnswer: string | string[];
      }[];
    };
  };
}

@Injectable()
export class LMSService {
  private readonly logger = new Logger(LMSService.name);
  private readonly lmsBaseUrl: string;
  private readonly assessmentBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Get service URLs from config
    this.lmsBaseUrl = this.configService.get<string>('LMS_SERVICE_URL', 'http://localhost:4002');
    this.assessmentBaseUrl = this.configService.get<string>('ASSESSMENT_SERVICE_URL', 'http://localhost:3002');
  }

  /**
   * Fetch initial course structure from LMS service
   * Only used for initializing course structure, not for real-time updates
   * 
   * @param userId - User ID to fetch courses for
   * @param cohortId - Cohort ID to filter courses by
   * @returns Promise<any[]> - Array of basic course structure
   */
  async getInitialCourseStructure(userId: string, cohortId?: string): Promise<any[]> {
    try {
      
      this.logger.debug(`Fetching initial course structure for user ${userId} from LMS service`);

      // For now, return empty structure since LMS API integration is not complete
      // TODO: Replace with actual LMS API endpoint for course enrollment
      // The actual endpoint might be something like:
      // GET /api/v1/courses/structure?userId={userId}&cohortId={cohortId}
      
      this.logger.warn(`LMS API integration not yet implemented, returning empty course structure`);
      return [];

    } catch (error) {
      this.logger.error(`Failed to fetch initial course structure for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Transform LMS course data to Elasticsearch format
   * 
   * @param courses - Raw course data from LMS service
   * @returns LMSCourse[] - Transformed courses
   */
  private transformCoursesToElasticsearchFormat(courses: any[]): LMSCourse[] {
    return courses.map(course => ({
      courseId: course.id || course.courseId,
      courseTitle: course.title || course.name || 'Untitled Course',
      progress: course.progress || 0,
      units: {
        type: 'nested',
        values: this.transformUnits(course.units || []),
      },
    }));
  }

  /**
   * Transform units data to Elasticsearch format
   * 
   * @param units - Raw units data from LMS service
   * @returns LMSUnit[] - Transformed units
   */
  private transformUnits(units: any[]): LMSUnit[] {
    return units.map(unit => ({
      unitId: unit.id || unit.unitId,
      unitTitle: unit.title || unit.name || 'Untitled Unit',
      progress: unit.progress || 0,
      contents: {
        type: 'nested',
        values: this.transformContents(unit.contents || []),
      },
    }));
  }

  /**
   * Transform contents data to Elasticsearch format
   * 
   * @param contents - Raw contents data from LMS service
   * @returns LMSContent[] - Transformed contents
   */
  private transformContents(contents: any[]): LMSContent[] {
    return contents.map(content => ({
      contentId: content.id || content.contentId,
      type: content.type || 'unknown',
      title: content.title || content.name || 'Untitled Content',
      status: content.status || 'not_started',
      tracking: this.transformTracking(content.tracking || {}),
    }));
  }

  /**
   * Transform tracking data to Elasticsearch format
   * 
   * @param tracking - Raw tracking data from LMS service
   * @returns Tracking object - Transformed tracking data
   */
  private transformTracking(tracking: any): LMSContent['tracking'] {
    return {
      percentComplete: tracking.percentComplete || 0,
      lastPosition: tracking.lastPosition || 0,
      currentPosition: tracking.currentPosition || 0,
      timeSpent: tracking.timeSpent || 0,
      visitedPages: tracking.visitedPages || [],
      totalPages: tracking.totalPages || 0,
      lastPage: tracking.lastPage || 0,
      currentPage: tracking.currentPage || 0,
      questionsAttempted: tracking.questionsAttempted || 0,
      totalQuestions: tracking.totalQuestions || 0,
      score: tracking.score || 0,
      answers: tracking.answers ? {
        type: 'nested',
        values: tracking.answers.map((answer: any) => ({
          questionId: answer.questionId || '',
          type: answer.type || 'text',
          submittedAnswer: answer.submittedAnswer || '',
        })),
      } : {
        type: 'nested',
        values: [],
      },
    };
  }

  /**
   * Health check for LMS service connectivity
   * 
   * @returns Promise<boolean> - true if LMS service is reachable
   */
  async healthCheckLMS(): Promise<boolean> {
    try {
      const response = await this.httpService.get(`${this.lmsBaseUrl}/health`);
      return response.status === 200;
    } catch (error) {
      this.logger.warn('LMS service health check failed:', error);
      return false;
    }
  }

  /**
   * Health check for Assessment service connectivity
   * 
   * @returns Promise<boolean> - true if Assessment service is reachable
   */
  async healthCheckAssessment(): Promise<boolean> {
    try {
      const response = await this.httpService.get(`${this.assessmentBaseUrl}/health`);
      return response.status === 200;
    } catch (error) {
      this.logger.warn('Assessment service health check failed:', error);
      return false;
    }
  }

  /**
   * Health check for both services
   * 
   * @returns Promise<{lms: boolean, assessment: boolean}> - Health status of both services
   */
  async healthCheck(): Promise<{lms: boolean, assessment: boolean}> {
    const [lms, assessment] = await Promise.all([
      this.healthCheckLMS(),
      this.healthCheckAssessment()
    ]);

    return { lms, assessment };
  }
} 