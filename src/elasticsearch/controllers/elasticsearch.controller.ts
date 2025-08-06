import { Controller, Post, Body, Get, Param, Put, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { UserElasticsearchService } from '../user-elasticsearch.service';
import { ElasticsearchDataFetcherService } from '../elasticsearch-data-fetcher.service';
import { Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('elasticsearch/users')
export class ElasticsearchController {
  private readonly logger = new Logger(ElasticsearchController.name);

  constructor(
    private readonly userElasticsearchService: UserElasticsearchService,
    private readonly dataFetcherService: ElasticsearchDataFetcherService,
  ) {}

  @Post('search')
  async searchUsers(@Body() body: any) {
    return this.userElasticsearchService.searchUsers(body);
  }

  @Get(':userId')
  async getUser(@Param('userId') userId: string) {
    return this.userElasticsearchService.getUser(userId);
  }

  @Post(':userId/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync user data from database to Elasticsearch',
    description: 'Fetches complete user data from database and syncs to Elasticsearch'
  })
  @ApiResponse({
    status: 200,
    description: 'User synced successfully'
  })
  @ApiResponse({
    status: 404,
    description: 'User not found'
  })
  async syncUserFromDatabase(@Param('userId') userId: string, @Body() webhookData?: any) {
    try {
      // Use comprehensive sync to ensure all data is fetched and synced together
      const userData = await this.dataFetcherService.comprehensiveUserSync(userId);

      if (!userData) {
        return {
          status: 'error',
          message: `User ${userId} not found in database`,
        };
      }

      // Clean up duplicate lessonTrackId entries before processing webhook data
      this.cleanupDuplicateLessonTrackIds(userData);

      // If webhook data contains assessment data, enhance the user data
      if (webhookData && webhookData.assessmentData) {
        this.logger.log(`Enhancing user data with assessment data for userId: ${userId}`);

        // Extract testId as contentId for assessment data
        const contentId = webhookData.assessmentData.testId;
        const testId = webhookData.assessmentData.testId;

        // Find or create application for this test
        let application = userData.applications?.find((app: any) => 
          app.courses?.values?.some((course: any) => 
            course.units?.values?.some((unit: any) => 
              unit.contents?.values?.some((content: any) => 
                content.contentId === contentId || content.contentId === testId
              )
            )
          )
        );

        if (!application) {
          // Create new application if it doesn't exist
          application = {
            cohortId: testId, // Using testId as cohortId for assessment
            formId: '',
            submissionId: '',
            cohortmemberstatus: 'enrolled',
            formstatus: 'active',
            completionPercentage: 0,
            progress: {
              pages: {},
              overall: {
                total: 0,
                completed: 0
              }
            },
            lastSavedAt: null,
            submittedAt: null,
            cohortDetails: {
              cohortId: testId,
              name: `Assessment ${testId}`,
              type: 'ASSESSMENT',
              status: 'active',
            },
            courses: {
              type: 'nested',
              values: []
            }
          };

          if (!userData.applications) {
            userData.applications = [];
          }
          userData.applications.push(application);
        }

        // Find or create course structure for assessment
        let course = application.courses.values.find((c: any) => c.courseId === testId);
        if (!course) {
          course = {
            courseId: testId,
            courseTitle: `Assessment ${testId}`,
            progress: 0,
            units: {
              type: 'nested',
              values: []
            }
          };
          application.courses.values.push(course);
        }

        // Find or create unit for assessment
        let unit = course.units.values.find((u: any) => u.unitId === testId);
        if (!unit) {
          unit = {
            unitId: testId,
            unitTitle: `Assessment Unit ${testId}`,
            progress: 0,
            contents: {
              type: 'nested',
              values: []
            }
          };
          course.units.values.push(unit);
        }

        // Find or create content for assessment
        let content = unit.contents.values.find((c: any) => c.contentId === contentId || c.contentId === testId);
        if (!content) {
          content = {
            contentId: contentId || testId,
            type: 'test',
            title: `Assessment ${testId}`,
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

        // Update content with assessment data
        content.tracking = {
          ...content.tracking,
          questionsAttempted: webhookData.assessmentData.questionsAttempted || 0,
          totalQuestions: webhookData.assessmentData.totalQuestions || 0,
          score: webhookData.assessmentData.score || 0,
          percentComplete: webhookData.assessmentData.percentComplete || 0,
          timeSpent: webhookData.assessmentData.timeSpent || 0,
          answers: {
            type: 'nested',
            values: webhookData.assessmentData.answers || []
          }
        };

        // Update content status based on completion
        if (webhookData.assessmentData.percentComplete >= 100) {
          content.status = 'completed';
        } else if (webhookData.assessmentData.percentComplete > 0) {
          content.status = 'in_progress';
        }

        this.logger.log(`Updated assessment content ${contentId} with ${webhookData.assessmentData.answers?.length || 0} answers`);
      }

      // If webhook data contains course hierarchy, enhance the user data
      if (webhookData && webhookData.courseHierarchy) {
        this.logger.log(`Enhancing user data with course hierarchy for userId: ${userId}`);

        // Extract cohortId from course params if available
        const cohortId = webhookData.courseHierarchy.params?.cohortId ||
                        webhookData.courseHierarchy.courseId ||
                        webhookData.courseId;

        // Find or create application for this cohort
        let application = userData.applications?.find((app: any) => app.cohortId === cohortId);

        if (!application) {
          // Create new application if it doesn't exist
          application = {
            cohortId: cohortId,
            formId: '',
            submissionId: '',
            cohortmemberstatus: 'enrolled',
            formstatus: 'active',
            completionPercentage: 0,
            progress: {
              pages: {},
              overall: {
                total: 0,
                completed: 0
              }
            },
            lastSavedAt: null,
            submittedAt: null,
            cohortDetails: {
              cohortId: cohortId,
              name: webhookData.courseHierarchy.name || 'Unknown Cohort',
              type: 'COHORT',
              status: 'active',
            },
            courses: {
              type: 'nested',
              values: []
            }
          };

          if (!userData.applications) {
            userData.applications = [];
          }
          userData.applications.push(application);
        }

        // Initialize course structure with hierarchy data
        if (!application.courses) {
          application.courses = {
            type: 'nested',
            values: []
          };
        }

        // Build course data from hierarchy
        const courseData = {
          courseId: webhookData.courseHierarchy.courseId,
          courseTitle: webhookData.courseHierarchy.name,
          progress: 0,
          units: {
            type: 'nested' as const,
            values: webhookData.courseHierarchy.modules?.map((module: any) => ({
              unitId: module.moduleId,
              unitTitle: module.name,
              progress: 0,
              contents: {
                type: 'nested' as const,
                values: module.lessons?.map((lesson: any) => ({
                  contentId: lesson.lessonId,
                  lessonId: lesson.lessonId, // Add lessonId for proper mapping
                  type: lesson.format || 'video',
                  title: lesson.name,
                  status: 'incomplete',
                  tracking: {
                    timeSpent: 0,
                    currentPosition: 0,
                    lastPosition: 0,
                    percentComplete: 0
                  },
                  // Add lesson tracking information if available
                  ...(webhookData.lessonTrackingInfo && {
                    expectedLessonTrackId: `${lesson.lessonId}-${webhookData.userId}-1`,
                    lessonTrackingInfo: {
                      courseId: webhookData.courseId,
                      userId: webhookData.userId,
                      tenantId: webhookData.lessonTrackingInfo.tenantId,
                      organisationId: webhookData.lessonTrackingInfo.organisationId
                    }
                  })
                })) || []
              }
            })) || []
          }
        };

        // Find or update course in application (preserve existing structure)
        let existingCourse = application.courses.values.find((c: any) => c.courseId === courseData.courseId);
        
        if (existingCourse) {
          // Update existing course structure by merging with new hierarchy
          this.logger.log(`Updating existing course structure for courseId: ${courseData.courseId}`);
          
          // Update course title if different
          if (courseData.courseTitle && existingCourse.courseTitle !== courseData.courseTitle) {
            existingCourse.courseTitle = courseData.courseTitle;
          }
          
          // Merge units from hierarchy with existing units
          for (const newUnit of courseData.units.values) {
            let existingUnit = existingCourse.units.values.find((u: any) => u.unitId === newUnit.unitId);
            
            if (existingUnit) {
              // Update existing unit
              existingUnit.unitTitle = newUnit.unitTitle;
              
              // Merge contents from hierarchy with existing contents
              for (const newContent of newUnit.contents.values) {
                let existingContent = existingUnit.contents.values.find((c: any) => c.contentId === newContent.contentId);
                
                if (existingContent) {
                  // Update existing content with new data but preserve tracking
                  existingContent.title = newContent.title;
                  existingContent.type = newContent.type;
                  // Don't overwrite existing tracking data
                } else {
                  // Add new content to existing unit
                  existingUnit.contents.values.push(newContent);
                }
              }
            } else {
              // Add new unit to existing course
              existingCourse.units.values.push(newUnit);
            }
          }
        } else {
          // Add new course to application
          application.courses.values.push(courseData);
        }

        // If lesson attempt data is provided, update the specific lesson in the existing structure
        if (webhookData.lessonAttemptData && webhookData.lessonAttemptData.lessonId) {
          this.logger.log(`Updating lesson attempt data for lessonId: ${webhookData.lessonAttemptData.lessonId}`);
          
          // Find the course and update the specific lesson
          const targetCourse = application.courses.values.find((c: any) => c.courseId === courseData.courseId);
          if (targetCourse) {
            let lessonUpdated = false;
            
            for (const unit of targetCourse.units.values) {
              for (const content of unit.contents.values) {
                // Only update if contentId matches lessonId AND this content doesn't already have a different lessonTrackId
                if (content.contentId === webhookData.lessonAttemptData.lessonId && 
                    (!content.lessonTrackId || content.lessonTrackId === webhookData.lessonAttemptData.attemptId)) {
                  
                  // Update lesson tracking data
                  content.tracking = {
                    ...content.tracking,
                    timeSpent: webhookData.lessonAttemptData.timeSpent || 0,
                    currentPosition: webhookData.lessonAttemptData.currentPosition || 0,
                    lastPosition: webhookData.lessonAttemptData.currentPosition || 0,
                    percentComplete: webhookData.lessonAttemptData.completionPercentage || 0
                  };

                  // Update lesson status based on completion
                  if (webhookData.lessonAttemptData.completionPercentage >= 100) {
                    content.status = 'complete';
                  } else if (webhookData.lessonAttemptData.completionPercentage > 0) {
                    content.status = 'incomplete';
                  }

                  // Add lessonTrackId for tracking - only if not already set
                  if (!content.lessonTrackId) {
                    content.lessonTrackId = webhookData.lessonAttemptData.attemptId;
                  }
                  content.lessonId = webhookData.lessonAttemptData.lessonId;

                  this.logger.log(`Updated lesson ${webhookData.lessonAttemptData.lessonId} with tracking data and lessonTrackId: ${webhookData.lessonAttemptData.attemptId}`);
                  lessonUpdated = true;
                  break; // Exit inner loop once we find and update the specific lesson
                }
              }
              if (lessonUpdated) break; // Exit outer loop once lesson is updated
            }
            
            // If no existing content was found with this lessonId, create a new one
            if (!lessonUpdated) {
              this.logger.log(`No existing content found for lessonId: ${webhookData.lessonAttemptData.lessonId}, creating new content`);
              
              // Find the first unit to add the content to (or create a default unit)
              let targetUnit = targetCourse.units.values[0];
              if (!targetUnit) {
                targetUnit = {
                  unitId: 'default-unit',
                  unitTitle: 'Default Unit',
                  progress: 0,
                  contents: {
                    type: 'nested',
                    values: []
                  }
                };
                targetCourse.units.values.push(targetUnit);
              }

              // Check if we're trying to create a unit with the same ID as a content item
              const contentId = webhookData.lessonAttemptData.lessonId;
              const existingUnitWithContentId = targetCourse.units.values.find((unit: any) => unit.unitId === contentId);
              
              if (existingUnitWithContentId) {
                this.logger.warn(`Found existing unit with same ID as content: ${contentId}, using that unit instead of creating new content`);
                targetUnit = existingUnitWithContentId;
              }

              // Create new content with lesson attempt data
              const newContent = {
                contentId: webhookData.lessonAttemptData.lessonId,
                lessonId: webhookData.lessonAttemptData.lessonId,
                lessonTrackId: webhookData.lessonAttemptData.attemptId,
                type: 'video', // Default type
                title: `Lesson ${webhookData.lessonAttemptData.lessonId}`,
                status: webhookData.lessonAttemptData.completionPercentage >= 100 ? 'complete' : 'incomplete',
                tracking: {
                  timeSpent: webhookData.lessonAttemptData.timeSpent || 0,
                  currentPosition: webhookData.lessonAttemptData.currentPosition || 0,
                  lastPosition: webhookData.lessonAttemptData.currentPosition || 0,
                  percentComplete: webhookData.lessonAttemptData.completionPercentage || 0
                }
              };
              
              targetUnit.contents.values.push(newContent);
              this.logger.log(`Created new content for lessonId: ${webhookData.lessonAttemptData.lessonId} with lessonTrackId: ${webhookData.lessonAttemptData.attemptId}`);
            }
          }
        }
      }

      // Create or update user in Elasticsearch
      await this.userElasticsearchService.createUser(userData);

      return {
        status: 'success',
        message: `User ${userId} synced successfully from database`,
        data: {
          userId: userData.userId,
          profileFields: Object.keys(userData.profile || {}).length,
          applicationsCount: userData.applications?.length || 0,
          courseHierarchyIncluded: !!(webhookData && webhookData.courseHierarchy),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to sync user ${userId}: ${error.message}`,
      };
    }
  }

  @Put(':userId')
  async updateUser(@Param('userId') userId: string, @Body() userData: any) {
    return this.userElasticsearchService.updateUser(userId, userData);
  }

  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.userElasticsearchService.deleteUser(userId);
  }

  private cleanupDuplicateLessonTrackIds(userData: any) {
    if (!userData || !userData.applications) {
      return;
    }

    this.logger.log(`Starting cleanup of duplicate lessonTrackIds for user ${userData.userId}`);

    userData.applications.forEach((application: any) => {
      if (!application.courses || !application.courses.values) {
        return;
      }

      application.courses.values.forEach((course: any) => {
        if (!course.units || !course.units.values) {
          return;
        }

        this.logger.log(`Processing course ${course.courseId} with ${course.units.values.length} units`);

        // Track unique lessons across ALL units in this course to prevent duplicates
        const uniqueLessons = new Map();
        const lessonTrackIdMap = new Map();

        // First pass: identify all unique lessons and their lessonTrackIds
        course.units.values.forEach((unit: any) => {
          if (!unit.contents || !unit.contents.values) {
            return;
          }

          this.logger.log(`Processing unit ${unit.unitId} with ${unit.contents.values.length} contents`);

          unit.contents.values.forEach((content: any) => {
            const contentId = content.contentId || content.lessonId;
            const lessonId = content.lessonId;
            const lessonTrackId = content.lessonTrackId;
            
            if (!contentId) return;

            this.logger.log(`Processing content ${contentId} with lessonTrackId: ${lessonTrackId}`);

            // Create a unique key for this lesson
            const uniqueKey = `${contentId}-${lessonId}`;

            // Track lessonTrackIds to prevent duplicates
            if (lessonTrackId) {
              if (lessonTrackIdMap.has(lessonTrackId)) {
                // This lessonTrackId already exists, remove it from this content
                this.logger.warn(`Removing duplicate lessonTrackId ${lessonTrackId} from content ${contentId}`);
                delete content.lessonTrackId;
              } else {
                lessonTrackIdMap.set(lessonTrackId, uniqueKey);
                this.logger.log(`Added lessonTrackId ${lessonTrackId} to map for content ${contentId}`);
              }
            }

            // Track unique lessons
            if (uniqueLessons.has(uniqueKey)) {
              const existingLesson = uniqueLessons.get(uniqueKey);
              
              this.logger.log(`Found duplicate lesson for key ${uniqueKey}: existing in unit ${existingLesson.unitId}, new in unit ${unit.unitId}`);
              
              // Prefer lesson with lessonTrackId
              if (content.lessonTrackId && !existingLesson.lessonTrackId) {
                uniqueLessons.set(uniqueKey, content);
                // Mark existing lesson for removal
                existingLesson._shouldRemove = true;
                this.logger.log(`Preferring new lesson with lessonTrackId for key ${uniqueKey}`);
              } else if (existingLesson.lessonTrackId && !content.lessonTrackId) {
                // Keep existing lesson, mark this one for removal
                content._shouldRemove = true;
                this.logger.log(`Keeping existing lesson with lessonTrackId for key ${uniqueKey}`);
              } else if (content.lessonTrackId && existingLesson.lessonTrackId) {
                // Both have lessonTrackId, keep the one with higher progress
                const existingProgress = existingLesson.tracking?.percentComplete || 0;
                const newProgress = content.tracking?.percentComplete || 0;
                
                if (newProgress > existingProgress) {
                  uniqueLessons.set(uniqueKey, content);
                  existingLesson._shouldRemove = true;
                  this.logger.log(`Preferring new lesson with higher progress for key ${uniqueKey}`);
                } else {
                  content._shouldRemove = true;
                  this.logger.log(`Keeping existing lesson with higher progress for key ${uniqueKey}`);
                }
              } else {
                // Neither has lessonTrackId, keep the one with higher progress
                const existingProgress = existingLesson.tracking?.percentComplete || 0;
                const newProgress = content.tracking?.percentComplete || 0;
                
                if (newProgress > existingProgress) {
                  uniqueLessons.set(uniqueKey, content);
                  existingLesson._shouldRemove = true;
                  this.logger.log(`Preferring new lesson with higher progress for key ${uniqueKey}`);
                } else {
                  content._shouldRemove = true;
                  this.logger.log(`Keeping existing lesson with higher progress for key ${uniqueKey}`);
                }
              }
            } else {
              uniqueLessons.set(uniqueKey, content);
              this.logger.log(`Added new unique lesson for key ${uniqueKey}`);
            }
          });
        });

        // Second pass: remove duplicate content from units
        course.units.values.forEach((unit: any) => {
          if (!unit.contents || !unit.contents.values) {
            return;
          }

          const originalCount = unit.contents.values.length;
          
          // Filter out content marked for removal
          unit.contents.values = unit.contents.values.filter((content: any) => {
            if (content._shouldRemove) {
              this.logger.warn(`Removing duplicate content ${content.contentId} from unit ${unit.unitId}`);
              return false;
            }
            // Clean up the temporary flag
            delete content._shouldRemove;
            return true;
          });

          const finalCount = unit.contents.values.length;
          if (originalCount !== finalCount) {
            this.logger.log(`Removed ${originalCount - finalCount} duplicate contents from unit ${unit.unitId}`);
          }
        });

        // Remove empty units
        const originalUnitCount = course.units.values.length;
        course.units.values = course.units.values.filter((unit: any) => 
          unit.contents && unit.contents.values && unit.contents.values.length > 0
        );
        const finalUnitCount = course.units.values.length;
        
        if (originalUnitCount !== finalUnitCount) {
          this.logger.log(`Removed ${originalUnitCount - finalUnitCount} empty units from course ${course.courseId}`);
        }
      });
    });

    this.logger.log(`Completed cleanup of duplicate lessonTrackIds for user ${userData.userId}`);
  }
} 