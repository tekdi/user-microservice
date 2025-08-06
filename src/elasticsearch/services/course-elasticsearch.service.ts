import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticsearchService } from '../elasticsearch.service';
import { User } from '../../user/entities/user-entity';
import { CohortMembers } from '../../cohortMembers/entities/cohort-member.entity';

export interface CourseProgressUpdate {
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
    questionsAttempted?: number;
    totalQuestions?: number;
    score?: number;
    answers?: Array<{
      questionId: string;
      type: string;
      submittedAnswer: string | string[];
    }>;
  };
}

export interface QuizAnswerUpdate {
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

@Injectable()
export class CourseElasticsearchService {
  private readonly logger = new Logger(CourseElasticsearchService.name);

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
  ) {}

  /**
   * Update course progress in Elasticsearch
   * Called when lesson tracking is updated via LMS service
   * 
   * @param progressUpdate - Course progress update data
   */
  async updateCourseProgress(progressUpdate: CourseProgressUpdate): Promise<void> {
    try {
      this.logger.debug(`Updating course progress for user ${progressUpdate.userId}, course ${progressUpdate.courseId}`);

      // Get the user's document from Elasticsearch
      const userDoc = await this.elasticsearchService.get('users', progressUpdate.userId);
      
      if (!userDoc) {
        this.logger.warn(`User document not found in Elasticsearch: ${progressUpdate.userId}`);
        return;
      }

      const sourceData = userDoc._source as any;
      const applications = sourceData.applications || [];

      // Find the relevant application (user + cohort combination)
      const appIndex = applications.findIndex((app: any) => 
        app.cohortId === progressUpdate.cohortId
      );

      if (appIndex === -1) {
        this.logger.warn(`Application not found for user ${progressUpdate.userId}, cohort ${progressUpdate.cohortId}`);
        return;
      }

      // Initialize courses structure if it doesn't exist
      if (!applications[appIndex].courses) {
        applications[appIndex].courses = {
          type: 'nested',
          values: []
        };
      }

      // Update or create course data
      this.updateCourseData(applications[appIndex].courses.values, progressUpdate);

      // Update the document in Elasticsearch
      await this.elasticsearchService.update('users', progressUpdate.userId, {
        applications: applications,
        updatedAt: new Date().toISOString()
      });

      this.logger.log(`Successfully updated course progress for user ${progressUpdate.userId}`);

    } catch (error) {
      this.logger.error(`Failed to update course progress for user ${progressUpdate.userId}:`, error);
      throw error;
    }
  }

  /**
   * Update quiz answers in Elasticsearch
   * Called when quiz answers are submitted via LMS service
   * 
   * @param quizUpdate - Quiz answer update data
   */
  async updateQuizAnswers(quizUpdate: QuizAnswerUpdate): Promise<void> {
    try {
      this.logger.debug(`Updating quiz answers for user ${quizUpdate.userId}, course ${quizUpdate.courseId}`);

      // Get the user's document from Elasticsearch
      const userDoc = await this.elasticsearchService.get('users', quizUpdate.userId);
      
      if (!userDoc) {
        this.logger.warn(`User document not found in Elasticsearch: ${quizUpdate.userId}`);
        return;
      }

      const sourceData = userDoc._source as any;
      const applications = sourceData.applications || [];

      // Find the relevant application
      // First try to find by exact cohortId match
      let appIndex = applications.findIndex((app: any) => 
        app.cohortId === quizUpdate.cohortId
      );

      // If not found, try to find by testId in the course structure
      if (appIndex === -1) {
        this.logger.debug(`No exact cohortId match for ${quizUpdate.cohortId}, searching in course structure`);
        
        for (let i = 0; i < applications.length; i++) {
          const app = applications[i];
          if (app.courses && app.courses.values) {
            for (const course of app.courses.values) {
              if (course.units && course.units.values) {
                for (const unit of course.units.values) {
                  if (unit.contents && unit.contents.values) {
                    for (const content of unit.contents.values) {
                      // Check if this content matches the testId
                      if (content.contentId === quizUpdate.contentId || 
                          content.contentId === quizUpdate.courseId ||
                          content.contentId === quizUpdate.unitId) {
                        appIndex = i;
                        this.logger.debug(`Found matching content in application ${i}, cohortId: ${app.cohortId}`);
                        break;
                      }
                    }
                    if (appIndex !== -1) break;
                  }
                }
                if (appIndex !== -1) break;
              }
            }
            if (appIndex !== -1) break;
          }
        }
      }

      if (appIndex === -1) {
        this.logger.warn(`Application not found for user ${quizUpdate.userId}, cohort ${quizUpdate.cohortId}. Available cohorts: ${applications.map((app: any) => app.cohortId).join(', ')}`);
        return;
      }

      // Initialize courses structure if it doesn't exist
      if (!applications[appIndex].courses) {
        applications[appIndex].courses = {
          type: 'nested',
          values: []
        };
      }

      // Update quiz data in the course structure
      this.updateQuizData(applications[appIndex].courses.values, quizUpdate);

      // Update the document in Elasticsearch
      await this.elasticsearchService.update('users', quizUpdate.userId, {
        applications: applications,
        updatedAt: new Date().toISOString()
      });

      this.logger.log(`Successfully updated quiz answers for user ${quizUpdate.userId}`);

    } catch (error) {
      this.logger.error(`Failed to update quiz answers for user ${quizUpdate.userId}:`, error);
      throw error;
    }
  }

  /**
   * Update course data structure with new progress information
   * 
   * @param courses - Existing courses array
   * @param progressUpdate - Progress update data
   */
  private updateCourseData(courses: any[], progressUpdate: CourseProgressUpdate): void {
    // Find existing course or create new one
    let course = courses.find(c => c.courseId === progressUpdate.courseId);
    
    if (!course) {
      course = {
        courseId: progressUpdate.courseId,
        courseTitle: progressUpdate.courseTitle,
        progress: 0,
        units: {
          type: 'nested',
          values: []
        }
      };
      courses.push(course);
    }

    // Update course-level progress
    course.progress = progressUpdate.progress;
    course.courseTitle = progressUpdate.courseTitle;

    // If unit-specific update
    if (progressUpdate.unitId) {
      this.updateUnitData(course.units.values, progressUpdate);
    }
  }

  /**
   * Update unit data structure with new progress information
   * 
   * @param units - Existing units array
   * @param progressUpdate - Progress update data
   */
  private updateUnitData(units: any[], progressUpdate: CourseProgressUpdate): void {
    if (!progressUpdate.unitId) return;

    // Find existing unit or create new one
    let unit = units.find(u => u.unitId === progressUpdate.unitId);
    
    if (!unit) {
      unit = {
        unitId: progressUpdate.unitId,
        unitTitle: progressUpdate.unitTitle || 'Untitled Unit',
        progress: 0,
        contents: {
          type: 'nested',
          values: []
        }
      };
      units.push(unit);
    }

    // Update unit-level progress
    if (progressUpdate.unitProgress !== undefined) {
      unit.progress = progressUpdate.unitProgress;
    }
    unit.unitTitle = progressUpdate.unitTitle || unit.unitTitle;

    // If content-specific update
    if (progressUpdate.contentId) {
      this.updateContentData(unit.contents.values, progressUpdate);
    }
  }

  /**
   * Update content data structure with new progress information
   * 
   * @param contents - Existing contents array
   * @param progressUpdate - Progress update data
   */
  private updateContentData(contents: any[], progressUpdate: CourseProgressUpdate): void {
    if (!progressUpdate.contentId) return;

    // Find existing content or create new one
    let content = contents.find(c => c.contentId === progressUpdate.contentId);
    
    if (!content) {
      content = {
        contentId: progressUpdate.contentId,
        type: progressUpdate.contentType || 'unknown',
        title: progressUpdate.contentTitle || 'Untitled Content',
        status: 'not_started',
        tracking: {}
      };
      contents.push(content);
    }

    // Update content data
    content.type = progressUpdate.contentType || content.type;
    content.title = progressUpdate.contentTitle || content.title;
    content.status = progressUpdate.contentStatus || content.status;

    // Update tracking data
    if (progressUpdate.tracking) {
      content.tracking = {
        ...content.tracking,
        ...progressUpdate.tracking
      };
    }
  }

  /**
   * Update quiz data in the course structure
   * 
   * @param courses - Existing courses array
   * @param quizUpdate - Quiz update data
   */
  private updateQuizData(courses: any[], quizUpdate: QuizAnswerUpdate): void {
    // Find the course
    let course = courses.find(c => c.courseId === quizUpdate.courseId);
    if (!course) {
      this.logger.debug(`Course ${quizUpdate.courseId} not found, creating new course structure`);
      course = {
        courseId: quizUpdate.courseId,
        courseTitle: `Assessment ${quizUpdate.courseId}`,
        progress: 0,
        units: {
          type: 'nested',
          values: []
        }
      };
      courses.push(course);
    }

    // Find the unit
    let unit = course.units.values.find((u: any) => u.unitId === quizUpdate.unitId);
    if (!unit) {
      this.logger.debug(`Unit ${quizUpdate.unitId} not found, creating new unit structure`);
      unit = {
        unitId: quizUpdate.unitId,
        unitTitle: `Assessment Unit ${quizUpdate.unitId}`,
        progress: 0,
        contents: {
          type: 'nested',
          values: []
        }
      };
      course.units.values.push(unit);
    }

    // Find the content (assessment)
    let content = unit.contents.values.find((c: any) => c.contentId === quizUpdate.contentId);
    if (!content) {
      this.logger.debug(`Content ${quizUpdate.contentId} not found, creating new content structure`);
      content = {
        contentId: quizUpdate.contentId,
        type: 'test',
        title: `Assessment ${quizUpdate.contentId}`,
        status: 'incomplete',
        tracking: {
          timeSpent: 0,
          currentPosition: 0,
          lastPosition: 0,
          percentComplete: 0,
          questionsAttempted: 0,
          totalQuestions: 0,
          score: 0,
          answers: {
            type: 'nested',
            values: []
          }
        }
      };
      unit.contents.values.push(content);
    }

    // Update quiz tracking data
    content.tracking = {
      ...content.tracking,
      questionsAttempted: quizUpdate.questionsAttempted,
      totalQuestions: quizUpdate.totalQuestions,
      score: quizUpdate.score || 0,
      percentComplete: quizUpdate.percentComplete,
      timeSpent: quizUpdate.timeSpent,
      answers: {
        type: 'nested',
        values: quizUpdate.answers || []
      }
    };

    // Update content status based on completion
    if (quizUpdate.percentComplete >= 100) {
      content.status = 'completed';
    } else if (quizUpdate.percentComplete > 0) {
      content.status = 'in_progress';
    }

    this.logger.debug(`Successfully updated quiz data for content ${quizUpdate.contentId} with ${quizUpdate.answers?.length || 0} answers`);
  }

  /**
   * Initialize course structure for a user's application
   * Called when a user is enrolled in a course
   * 
   * @param userId - User ID
   * @param cohortId - Cohort ID
   * @param courseData - Initial course data from LMS
   */
  async initializeCourseStructure(
    userId: string, 
    cohortId: string, 
    courseData: any
  ): Promise<void> {
    try {
      this.logger.debug(`Initializing course structure for user ${userId}, cohort ${cohortId}`);

      // Get the user's document from Elasticsearch
      const userDoc = await this.elasticsearchService.get('users', userId);
      
      if (!userDoc) {
        this.logger.warn(`User document not found in Elasticsearch: ${userId}`);
        return;
      }

      const sourceData = userDoc._source as any;
      const applications = sourceData.applications || [];

      // Find the relevant application
      const appIndex = applications.findIndex((app: any) => 
        app.cohortId === cohortId
      );

      if (appIndex === -1) {
        this.logger.warn(`Application not found for user ${userId}, cohort ${cohortId}`);
        return;
      }

      // Initialize courses structure
      applications[appIndex].courses = {
        type: 'nested',
        values: this.transformLMSCourseData(courseData)
      };

      // Update the document in Elasticsearch
      await this.elasticsearchService.update('users', userId, {
        applications: applications,
        updatedAt: new Date().toISOString()
      });

      this.logger.log(`Successfully initialized course structure for user ${userId}`);

    } catch (error) {
      this.logger.error(`Failed to initialize course structure for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Transform LMS course data to Elasticsearch format
   * 
   * @param courseData - Raw course data from LMS
   * @returns Transformed course data
   */
  private transformLMSCourseData(courseData: any): any[] {
    if (!Array.isArray(courseData)) {
      return [];
    }

    return courseData.map(course => ({
      courseId: course.id || course.courseId,
      courseTitle: course.title || course.name || 'Untitled Course',
      progress: 0, // Initialize with 0 progress
      units: {
        type: 'nested',
        values: (course.units || []).map((unit: any) => ({
          unitId: unit.id || unit.unitId,
          unitTitle: unit.title || unit.name || 'Untitled Unit',
          progress: 0,
          contents: {
            type: 'nested',
            values: (unit.contents || []).map((content: any) => ({
              contentId: content.id || content.contentId,
              type: content.type || 'unknown',
              title: content.title || content.name || 'Untitled Content',
              status: 'not_started',
              tracking: {
                percentComplete: 0,
                timeSpent: 0
              }
            }))
          }
        }))
      }
    }));
  }
} 