import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Logger,
  Patch,
  Param
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody 
} from '@nestjs/swagger';
import { CourseElasticsearchService, CourseProgressUpdate, QuizAnswerUpdate } from '../services/course-elasticsearch.service';

class CourseProgressDto {
  userId: string;
  cohortId: string;
  courseId: string;
  courseTitle: string;
  progress: number;
  unitId?: string;
  unitTitle?: string;
  unitProgress?: number;
  contentId?: string;
  contentType?: string;
  contentTitle?: string;
  contentStatus?: string;
  tracking?: {
    percentComplete?: number;
    lastPosition?: number;
    currentPosition?: number;
    timeSpent?: number;
    visitedPages?: number[];
    totalPages?: number;
    lastPage?: number;
    currentPage?: number;
  };
}

class QuizAnswerDto {
  userId: string;
  cohortId: string;
  courseId: string;
  unitId: string;
  contentId: string;
  attemptId: string;
  answers: Array<{
    questionId: string;
    type: string;
    submittedAnswer: string | string[];
  }>;
  score?: number;
  questionsAttempted: number;
  totalQuestions: number;
  percentComplete: number;
  timeSpent: number;
}

class CourseInitializationDto {
  userId: string;
  cohortId: string;
  courseData: any[];
}

@ApiTags('Course Elasticsearch Webhooks')
@Controller('elasticsearch/courses')
export class CourseWebhookController {
  private readonly logger = new Logger(CourseWebhookController.name);

  constructor(
    private readonly courseElasticsearchService: CourseElasticsearchService,
  ) {}

  /**
   * Webhook endpoint for lesson tracking updates from LMS SERVICE
   * Called by shiksha-lms-service when user progress is updated
   * Corresponds to: PATCH /attempts/progress/:attemptId in shiksha-lms-service
   */
  @Patch('lms/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update course progress from LMS service',
    description: 'Webhook endpoint called by shiksha-lms-service when lesson tracking is updated'
  })
  @ApiBody({ type: CourseProgressDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Course progress updated successfully in Elasticsearch' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request data' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Internal server error' 
  })
  async updateLMSCourseProgress(@Body() progressData: CourseProgressDto): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      this.logger.log(`[LMS SERVICE] Received course progress update for user ${progressData.userId}, course ${progressData.courseId}`);

      // Validate required fields
      if (!progressData.userId || !progressData.cohortId || !progressData.courseId) {
        throw new Error('Missing required fields: userId, cohortId, courseId');
      }

      // Update course progress in Elasticsearch
      await this.courseElasticsearchService.updateCourseProgress(progressData);

      return {
        success: true,
        message: 'LMS course progress updated successfully',
        data: {
          userId: progressData.userId,
          courseId: progressData.courseId,
          progress: progressData.progress,
          source: 'lms-service'
        }
      };

    } catch (error) {
      this.logger.error(`[LMS SERVICE] Failed to update course progress:`, error);
      throw error;
    }
  }

  /**
   * Webhook endpoint for quiz answer submissions from ASSESSMENT SERVICE  
   * Called by shiksha-assessment-service when quiz answers are submitted
   * Corresponds to: POST /:attemptId/answers in shiksha-assessment-service
   */
  @Post('assessment/quiz-answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update quiz answers from Assessment service',
    description: 'Webhook endpoint called by shiksha-assessment-service when quiz answers are submitted'
  })
  @ApiBody({ type: QuizAnswerDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Quiz answers updated successfully in Elasticsearch' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request data' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Internal server error' 
  })
  async updateAssessmentQuizAnswers(@Body() quizData: QuizAnswerDto): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      this.logger.log(`[ASSESSMENT SERVICE] Received quiz answer update for user ${quizData.userId}, assessment ${quizData.contentId}`);

      // Validate required fields
      if (!quizData.userId || !quizData.cohortId || !quizData.courseId || !quizData.contentId) {
        throw new Error('Missing required fields: userId, cohortId, courseId, contentId');
      }

      // Update quiz answers in Elasticsearch
      await this.courseElasticsearchService.updateQuizAnswers(quizData);

      return {
        success: true,
        message: 'Assessment quiz answers updated successfully',
        data: {
          userId: quizData.userId,
          contentId: quizData.contentId,
          score: quizData.score,
          percentComplete: quizData.percentComplete,
          source: 'assessment-service'
        }
      };

    } catch (error) {
      this.logger.error(`[ASSESSMENT SERVICE] Failed to update quiz answers:`, error);
      throw error;
    }
  }

  /**
   * Initialize course structure for a user
   * Called when a user is enrolled in courses
   */
  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Initialize course structure in Elasticsearch',
    description: 'Initialize the course structure when a user is enrolled in courses'
  })
  @ApiBody({ type: CourseInitializationDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Course structure initialized successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request data' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Internal server error' 
  })
  async initializeCourseStructure(@Body() initData: CourseInitializationDto): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      this.logger.log(`Initializing course structure for user ${initData.userId}, cohort ${initData.cohortId}`);

      // Validate required fields
      if (!initData.userId || !initData.cohortId || !initData.courseData) {
        throw new Error('Missing required fields: userId, cohortId, courseData');
      }

      // Initialize course structure in Elasticsearch
      await this.courseElasticsearchService.initializeCourseStructure(
        initData.userId,
        initData.cohortId,
        initData.courseData
      );

      return {
        success: true,
        message: 'Course structure initialized successfully',
        data: {
          userId: initData.userId,
          cohortId: initData.cohortId,
          coursesCount: initData.courseData.length
        }
      };

    } catch (error) {
      this.logger.error(`Failed to initialize course structure:`, error);
      throw error;
    }
  }

  /**
   * Bulk update course progress for multiple users
   * Useful for batch operations
   */
  @Post('bulk-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Bulk update course progress',
    description: 'Update course progress for multiple users in batch'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Bulk progress update completed' 
  })
  async bulkUpdateProgress(@Body() bulkData: {
    updates: CourseProgressDto[];
  }): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      this.logger.log(`Received bulk progress update for ${bulkData.updates.length} items`);

      const results = {
        successful: 0,
        failed: 0,
        errors: [] as string[]
      };

      // Process each update
      for (const update of bulkData.updates) {
        try {
          await this.courseElasticsearchService.updateCourseProgress(update);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`User ${update.userId}: ${error.message}`);
          this.logger.error(`Failed to update progress for user ${update.userId}:`, error);
        }
      }

      return {
        success: true,
        message: `Bulk update completed: ${results.successful} successful, ${results.failed} failed`,
        data: results
      };

    } catch (error) {
      this.logger.error(`Failed to process bulk progress update:`, error);
      throw error;
    }
  }
} 