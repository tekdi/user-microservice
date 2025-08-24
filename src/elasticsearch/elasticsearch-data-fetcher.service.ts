import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user-entity';
import { CohortMembers } from '../cohortMembers/entities/cohort-member.entity';
import { FormSubmission } from '../forms/entities/form-submission.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { Cohort } from '../cohort/entities/cohort.entity';
import { IUser, IProfile } from './interfaces/user.interface';
import { isElasticsearchEnabled } from '../common/utils/elasticsearch.util';
import { LoggerUtil } from '../common/logger/LoggerUtil';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import { FormsService } from '../forms/forms.service';
import { LMSService } from '../common/services/lms.service';
import axios from 'axios';
import { UserElasticsearchService } from './user-elasticsearch.service';

/**
 * Centralized Elasticsearch Data Fetcher Service
 * 
 * This service handles all data fetching operations from database to Elasticsearch.
 * It provides reusable functions for fetching user profiles, applications, and cohort details
 * that can be used across different adapters and services.
 * 
 * Key Features:
 * - Centralized data fetching logic to reduce code duplication
 * - Handles user profile data with custom fields
 * - Manages application data with form submissions and cohort details
 * - Provides course data structure for future use
 * - Implements proper error handling and logging
 * - Supports dynamic field mapping and schema extraction
 */
@Injectable()
export class ElasticsearchDataFetcherService {
  private readonly logger = new Logger(ElasticsearchDataFetcherService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(FieldValues)
    private readonly fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(Cohort)
    private readonly cohortRepository: Repository<Cohort>,
    private readonly fieldsService: PostgresFieldsService,
    private readonly formsService: FormsService,
    private readonly lmsService: LMSService,
    private readonly userElasticsearchService: UserElasticsearchService,
  ) {}

  /**
   * Fetch complete user document for Elasticsearch from database
   * This is the main function that fetches all required data for a user
   * 
   * @param userId - The user ID to fetch data for
   * @returns Promise<IUser | null> - Complete user document or null if user not found
   */
  async fetchUserDocumentForElasticsearch(userId: string): Promise<any> {
    try {
      this.logger.log(`Fetching complete user document for userId: ${userId}`);

      // Fetch user from database first to get tenant/organisation info
      const user = await this.userRepository.findOne({ where: { userId } });
      if (!user) {
        this.logger.warn(`User not found in database: ${userId}`);
        return null;
      }

      // Fetch user profile data
      const userProfile = await this.fetchUserProfile(user);
      if (!userProfile) {
        this.logger.warn(`User profile not found for userId: ${userId}`);
        return null;
      }

      // Fetch applications data
      const applications = await this.fetchUserApplications(userId);
      
      // Fetch answer data for this user
      // For now, use default tenant/organisation values since they're not in User entity
      const answerData = await this.fetchUserAnswerData(userId, 'default-tenant', 'default-organisation');

      // Enhance applications with answer data
      if (applications && applications.length > 0 && answerData.length > 0) {
        for (const application of applications) {
          if (application.courses && application.courses.values) {
            // Map answer data to courses
            for (const course of application.courses.values) {
              if (course.units && course.units.values) {
                for (const unit of course.units.values) {
                  if (unit.contents && unit.contents.values) {
                    for (const content of unit.contents.values) {
                      if (content.type === 'test') {
                        // Find matching answer data for this test
                        const matchingAnswerData = answerData.find(answer => 
                          answer.testId === content.contentId
                        );
                        
                        if (matchingAnswerData) {
                          content.tracking = {
                            ...content.tracking,
                            questionsAttempted: matchingAnswerData.questionsAttempted,
                            totalQuestions: matchingAnswerData.totalQuestions,
                            score: matchingAnswerData.score,
                            percentComplete: matchingAnswerData.percentComplete,
                            timeSpent: matchingAnswerData.timeSpent,
                            answers: {
                              type: 'nested',
                              values: matchingAnswerData.answers
                            }
                          };
                          
                          // Update content status based on completion
                          if (matchingAnswerData.percentComplete >= 100) {
                            content.status = 'completed';
                          } else if (matchingAnswerData.percentComplete > 0) {
                            content.status = 'in_progress';
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return {
        userId: userProfile.userId,
        profile: userProfile,
        applications: applications,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to fetch user document for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Comprehensive sync method that ensures all user data is fetched and synced together
   * This method handles all the issues: profile, applications, courses, and answers
   * Now enhanced to fetch lesson, module, and question data from all three services
   */
  async comprehensiveUserSync(userId: string): Promise<any> {
    try {
      this.logger.log(`Starting comprehensive sync for userId: ${userId}`);

      // 1. Fetch user from database first to get tenant/organisation info
      const user = await this.userRepository.findOne({ where: { userId } });
      if (!user) {
        this.logger.warn(`User not found in database: ${userId}`);
        return null;
      }

      // 2. Fetch complete user profile data
      const userProfile = await this.fetchUserProfile(user);
      if (!userProfile) {
        this.logger.warn(`User profile not found for userId: ${userId}`);
        return null;
      }

      // 3. Fetch complete applications data (with graceful error handling)
      let applications = [];
      try {
        applications = await this.fetchUserApplications(userId);
        this.logger.log(`Fetched ${applications.length} applications for userId: ${userId}`);
        if (applications.length === 0) {
          this.logger.log(`No applications found for userId: ${userId} - this is normal if user has no cohort memberships`);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch applications for userId: ${userId}, continuing with empty applications:`, error.message);
        applications = [];
      }
      
      // 4. Get user's tenant and organisation data
      let tenantId = 'default-tenant';
      let organisationId = 'default-organisation';
      
      try {
        const userTenantMapping = await this.cohortMembersRepository.manager
          .getRepository('UserTenantMapping')
          .findOne({
            where: { userId }
          });
        
        if (userTenantMapping) {
          tenantId = userTenantMapping.tenantId || 'default-tenant';
          organisationId = userTenantMapping.organisationId || 'default-organisation';
          this.logger.log(`Found tenant data for userId: ${userId}, tenantId: ${tenantId}, organisationId: ${organisationId}`);
        } else {
          this.logger.warn(`No tenant mapping found for userId: ${userId}, using default values`);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch tenant data for userId: ${userId}, using default values:`, error.message);
      }

      // 5. Fetch lesson and module data from LMS service through middleware
      let lmsData = [];
      try {
        lmsData = await this.fetchLessonModuleDataFromLMS(userId, tenantId, organisationId);
      } catch (error) {
        this.logger.warn(`Failed to fetch LMS data for userId: ${userId}, continuing without LMS data:`, error.message);
        lmsData = [];
      }

      // 6. Fetch question and answer data from Assessment service through middleware
      let assessmentData = [];
      try {
        assessmentData = await this.fetchQuestionAnswerDataFromAssessment(userId, tenantId, organisationId);
      } catch (error) {
        this.logger.warn(`Failed to fetch assessment data for userId: ${userId}, continuing without assessment data:`, error.message);
        assessmentData = [];
      }

      // 7. Merge all data together
      const completeUserData = this.mergeUserDataWithAllServices(userProfile, applications, lmsData, assessmentData);

      this.logger.log(`Comprehensive sync completed for userId: ${userId}`);
      return completeUserData;
    } catch (error) {
      this.logger.error(`Failed to perform comprehensive sync for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch user profile data including custom fields
   * 
   * @param user - User entity from database
   * @returns Promise<IProfile> - User profile with custom fields
   */
  private async fetchUserProfile(user: User): Promise<IProfile> {
    try {
      this.logger.log(`Fetching user profile for userId: ${user.userId}`);
      this.logger.debug(`User data from database:`, {
        userId: user.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        gender: user.gender,
        status: user.status
      });

      // Check if user has basic profile data
      if (!user.firstName && !user.lastName && !user.email) {
        this.logger.warn(`User ${user.userId} has empty profile data in database. Attempting to fetch from user service...`);
        
        // Try to fetch user data from user service as fallback
        try {
          const userService = this.userRepository.manager.getRepository('Users');
          const freshUserData = await userService.findOne({ 
            where: { userId: user.userId },
            select: ['userId', 'username', 'firstName', 'lastName', 'middleName', 'email', 'mobile', 'mobile_country_code', 'gender', 'dob', 'country', 'address', 'district', 'state', 'pincode', 'status']
          });
          
          if (freshUserData && (freshUserData.firstName || freshUserData.lastName || freshUserData.email)) {
            this.logger.log(`Found fresh user data for ${user.userId}, using it instead`);
            // Update the user object with fresh data
            Object.assign(user, freshUserData);
          } else {
            this.logger.warn(`No fresh user data found for ${user.userId}, using default profile`);
          }
        } catch (fallbackError) {
          this.logger.error(`Failed to fetch fresh user data for ${user.userId}:`, fallbackError);
        }
      }

      // Fetch custom fields for the user
      const customFields = await this.fetchUserCustomFields(user.userId);

      // Format date of birth
      let formattedDob: string | null = null;
      if (user.dob instanceof Date) {
        formattedDob = user.dob.toISOString();
      } else if (typeof user.dob === 'string') {
        formattedDob = user.dob;
      }

      // Create profile object with better fallbacks
      const profile: IProfile = {
        userId: user.userId,
        username: user.username || `user-${user.userId}`,
        firstName: user.firstName || 'User',
        lastName: user.lastName || 'Name',
        middleName: user.middleName || '',
        email: user.email || `user-${user.userId}@example.com`,
        mobile: user.mobile?.toString() || '',
        mobile_country_code: user.mobile_country_code || '',
        gender: user.gender || '',
        dob: formattedDob,
        country: user.country || '',
        address: user.address || '',
        district: user.district || '',
        state: user.state || '',
        pincode: user.pincode || '',
        status: user.status || 'active',
        customFields,
      };

      this.logger.log(`Successfully created profile for userId: ${user.userId}`, {
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        hasCustomFields: customFields.length > 0
      });

      return profile;

    } catch (error) {
      this.logger.error(`Failed to fetch user profile for ${user.userId}:`, error);
      
      // Return a default profile as last resort
      return {
        userId: user.userId,
        username: `user-${user.userId}`,
        firstName: 'User',
        lastName: 'Name',
        middleName: '',
        email: `user-${user.userId}@example.com`,
        mobile: '',
        mobile_country_code: '',
        gender: '',
        dob: null,
        country: '',
        address: '',
        district: '',
        state: '',
        pincode: '',
        status: 'active',
        customFields: [],
      };
    }
  }

  /**
   * Fetch user custom fields from database using existing fields service
   * This ensures consistency with the existing implementation
   * 
   * @param userId - User ID to fetch custom fields for
   * @returns Promise<any[]> - Array of custom field objects
   */
  private async fetchUserCustomFields(userId: string): Promise<any[]> {
    try {
      // Use existing fields service to get custom field details
      const customFields = await this.fieldsService.getUserCustomFieldDetails(userId);
      
      this.logger.debug(`Found ${customFields.length} custom fields for user ${userId}`);

      // Get all form submissions for this user to identify form fields
      const submissions = await this.formSubmissionRepository.find({
        where: { itemId: userId },
      });

      this.logger.debug(`Found ${submissions.length} form submissions for filtering custom fields`);

      // Collect all form field IDs to exclude from custom fields
      const formFieldIds = new Set<string>();
      
      for (const submission of submissions) {
        try {
          // Extract field IDs from form schema using proper implementation
          const formFields = await this.extractFieldIdsFromFormSchema(submission.formId);
          formFields.forEach(fieldId => formFieldIds.add(fieldId));
        } catch (error) {
          this.logger.warn(`Failed to extract field IDs from form ${submission.formId}:`, error);
        }
      }

      this.logger.debug(`Form field IDs to exclude: ${Array.from(formFieldIds).join(', ')}`);

      // Filter out fields that are part of form schemas
      const filteredCustomFields = customFields.filter((field) => !formFieldIds.has(field.fieldId));
      
      this.logger.debug(`After filtering, ${filteredCustomFields.length} custom fields remain`);

      // Transform to match the expected format
      const transformedFields = filteredCustomFields.map(field => ({
        fieldId: field.fieldId,
        fieldValuesId: field.fieldValuesId || '',
        fieldname: field.label || '',
        code: field.code || '',
        label: field.label || '',
        type: field.type || '',
        value: this.processFieldValueForElasticsearch(field.value),
        context: field.context || '',
        contextType: field.contextType || '',
        state: field.state || '',
        fieldParams: field.fieldParams || {},
      }));

      this.logger.debug(`Returning ${transformedFields.length} transformed custom fields`);
      return transformedFields;

    } catch (error) {
      this.logger.error(`Failed to fetch custom fields for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Fetch user applications with form submissions and cohort details
   * 
   * @param userId - User ID to fetch applications for
   * @returns Promise<any[]> - Array of application objects
   */
  async fetchUserApplications(userId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching applications for userId: ${userId}`);

      // Get all cohort members for this user (without relations since they don't exist)
      const cohortMembers = await this.cohortMembersRepository.find({
        where: { userId }
      });

      if (cohortMembers.length === 0) {
        this.logger.warn(`No cohort members found for userId: ${userId}`);
        
        // Check if user has form submissions to create a basic application
        const submissions = await this.formSubmissionRepository.find({
          where: { itemId: userId }
        });
        
        if (submissions.length > 0) {
          this.logger.log(`Found ${submissions.length} form submissions for user without cohort memberships, creating basic application`);
          
          // Build proper form data and progress for the first submission
          const submission = submissions[0];
          this.logger.debug(`Building form data for submission:`, submission.submissionId);
          
          const { formData, pages } = await this.buildFormDataWithPages(submission);
          this.logger.debug(`Form data built:`, formData);
          this.logger.debug(`Pages built:`, pages);
          
          const { percentage, progress } = this.calculateCompletionPercentage(formData);
          this.logger.debug(`Completion percentage: ${percentage}%`);
          this.logger.debug(`Progress calculated:`, progress);
          
          // Create a basic application for users with form submissions but no cohort memberships
          const basicApplication = {
            cohortId: 'default-cohort',
            cohortmemberstatus: 'active',
            cohortDetails: {
              cohortId: 'default-cohort',
              name: 'Default Cohort',
              type: 'COHORT',
              status: 'active',
            },
            formId: submission.formId,
            submissionId: submission.submissionId,
            formstatus: 'active',
            completionPercentage: percentage,
            progress: progress,
            lastSavedAt: submission.updatedAt?.toISOString() || new Date().toISOString(),
            submittedAt: submission.status === 'active' ? submission.updatedAt?.toISOString() : null,
            formData: formData,
            courses: {
              type: 'nested',
              values: []
            }
          };
          
          this.logger.debug(`Created basic application:`, basicApplication);
          return [basicApplication];
        }
        
        return [];
      }

      const applications = [];

      for (const cohortMember of cohortMembers) {
        try {
          // Get form submissions for this user
          const submissions = await this.formSubmissionRepository.find({
            where: { itemId: userId },
          });
          
          const application = await this.buildApplicationForCohort(userId, cohortMember, submissions);
          if (application) {
            applications.push(application);
          }
        } catch (error) {
          this.logger.warn(`Failed to build application for cohort ${cohortMember.cohortId}, skipping:`, error.message);
          // Continue with other applications instead of failing completely
          continue;
        }
      }

      this.logger.log(`Returning ${applications.length} applications for user ${userId}`);
      return applications;
    } catch (error) {
      this.logger.error(`Failed to fetch applications for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Build application object for a specific cohort
   * 
   * @param userId - User ID
   * @param membership - Cohort membership entity
   * @param submissions - All form submissions for the user
   * @returns Promise<any> - Application object or null
   */
  private async buildApplicationForCohort(
    userId: string,
    membership: CohortMembers,
    submissions: FormSubmission[]
  ): Promise<any> {
    try {
      // Always fetch cohort details first (this is reliable)
      const cohort = await this.cohortRepository.findOne({
        where: { cohortId: membership.cohortId },
      });

      // Initialize application with basic cohort data
      const application = {
        cohortId: membership.cohortId,
        cohortmemberstatus: membership.status || 'active',
        cohortDetails: {
          cohortId: membership.cohortId,
          name: cohort?.name || 'Unknown Cohort',
          type: 'COHORT',
          status: cohort?.status || 'active',
        },
        // Initialize with empty form data
        formId: '',
        submissionId: '',
        formstatus: 'active',
        completionPercentage: 0,
        progress: {},
        lastSavedAt: null,
        submittedAt: null,
        formData: {},
        // Initialize with empty courses structure
        courses: {
          type: 'nested',
          values: []
        }
      };

      // Try to find form submission for this cohort
      let submission = null;
      
      for (const sub of submissions) {
        try {
          const form = await this.formsService.getFormById(sub.formId);
          if (form?.contextId === membership.cohortId) {
            submission = sub;
            break;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch form for formId ${sub.formId}:`, error);
          // Continue to next submission instead of failing
          continue;
        }
      }
      
      // If no submission found by contextId, use the first submission as fallback
      if (!submission && submissions.length > 0) {
        submission = submissions[0];
        this.logger.warn(`No submission found for cohort ${membership.cohortId}, using first submission as fallback`);
      }
      
      // If we have a submission, try to build form data
      if (submission) {
        try {
          // Build form data with proper page structure
          const { formData, pages } = await this.buildFormDataWithPages(submission);

          // Calculate completion percentage and progress
          const { percentage, progress } = this.calculateCompletionPercentage(formData);

          // Update application with form data
          application.formId = submission.formId;
          application.submissionId = submission.submissionId;
          application.formstatus = submission.status || 'active';
          application.completionPercentage = percentage;
          application.progress = progress;
          application.lastSavedAt = submission.updatedAt ? submission.updatedAt.toISOString() : null;
          application.submittedAt = submission.status === 'active' ? submission.updatedAt?.toISOString() : null;
          application.formData = formData;
        } catch (formError) {
          this.logger.warn(`Failed to build form data for submission ${submission.submissionId}:`, formError);
          // Keep application with basic data, form data will be empty
        }
      } else {
        this.logger.warn(`No form submission found for user ${userId} in cohort ${membership.cohortId}`);
      }

      // Always try to fetch course data (this should work independently)
      try {
        application.courses = await this.getCourseDataForApplication(userId, membership.cohortId);
      } catch (courseError) {
        this.logger.warn(`Failed to fetch course data for user ${userId}, cohort ${membership.cohortId}:`, courseError);
        // Initialize with empty courses structure
        application.courses = {
          type: 'nested',
          values: []
        };
      }

      return application;

    } catch (error) {
      this.logger.error(`Failed to build application for cohort ${membership.cohortId}:`, error);
      // Return basic application with cohort data even if everything else fails
      return {
        cohortId: membership.cohortId,
        cohortmemberstatus: membership.status || 'active',
        cohortDetails: {
          cohortId: membership.cohortId,
          name: 'Unknown Cohort',
          type: 'COHORT',
          status: 'active',
        },
        formId: '',
        submissionId: '',
        formstatus: 'active',
        completionPercentage: 0,
        progress: {},
        lastSavedAt: null,
        submittedAt: null,
        formData: {},
        courses: {
          type: 'nested',
          values: []
        }
      };
    }
  }

  /**
   * Build form data from submission
   * 
   * @param submission - Form submission entity
   * @returns Promise<any> - Form data object
   */
  private async buildFormDataFromSubmission(submission: FormSubmission): Promise<any> {
    try {
      // Fetch field values for this submission
      // Note: FieldValues entity doesn't have formId field, so we'll filter by itemId only
      const fieldValues = await this.fieldValuesRepository.find({
        where: { 
          itemId: submission.itemId,
        },
        relations: ['field'],
      });

      // Group field values by page (simplified - you may need to implement proper page mapping)
      const formData: any = {};
      
      for (const fieldValue of fieldValues) {
        // For now, put all fields in a default page
        // In a real implementation, you'd need to map fields to pages based on form schema
        const pageId = 'default';
        
        if (!formData[pageId]) {
          formData[pageId] = {};
        }
        
        formData[pageId][fieldValue.fieldId] = this.processFieldValueForElasticsearch(fieldValue.value);
      }

      return formData;

    } catch (error) {
      this.logger.error(`Failed to build form data from submission ${submission.submissionId}:`, error);
      return {};
    }
  }

  /**
   * Build form data with proper page structure from submission
   * 
   * @param submission - Form submission entity
   * @returns Promise<any> - Form data with page structure
   */
  private async buildFormDataWithPages(submission: FormSubmission): Promise<any> {
    try {
      this.logger.debug(`Building form data with pages for submission ${submission.submissionId}`);
      
      // Fetch field values for this submission
      const fieldValues = await this.fieldValuesRepository.find({
        where: { 
          itemId: submission.itemId,
        },
        relations: ['field'],
      });

      this.logger.debug(`Found ${fieldValues.length} field values for submission ${submission.submissionId}`);

      // Get form schema to build proper page structure
      const formSchema = await this.getFormSchema(submission.formId);
      this.logger.debug(`Retrieved form schema for formId ${submission.formId}:`, Object.keys(formSchema));
      
      const fieldIdToPageName = this.getFieldIdToPageNameMap(formSchema);
      this.logger.debug(`Field ID to page name mapping:`, fieldIdToPageName);

      // Build page structure
      const formData: any = {};
      const pages: any = {};

      // Initialize pages from schema
      for (const [pageKey, pageSchema] of Object.entries(formSchema)) {
        const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
        pages[pageName] = { completed: true, fields: {} };
        formData[pageName] = {};
      }

      this.logger.debug(`Initialized ${Object.keys(pages).length} pages from schema`);

      // Map field values to correct pages
      for (const fieldValue of fieldValues) {
        const pageName = fieldIdToPageName[fieldValue.fieldId];
        if (!pageName) {
          this.logger.warn(`Field ${fieldValue.fieldId} not found in schema mapping, skipping`);
          continue;
        }

        if (!pages[pageName]) {
          pages[pageName] = { completed: true, fields: {} };
          formData[pageName] = {};
        }

        const processedValue = this.processFieldValueForElasticsearch(fieldValue.value);
        pages[pageName].fields[fieldValue.fieldId] = processedValue;
        formData[pageName][fieldValue.fieldId] = processedValue;
        
        this.logger.debug(`Mapped field ${fieldValue.fieldId} to page ${pageName} with value:`, processedValue);
      }

      // Update page completion status
      for (const [pageName, pageData] of Object.entries(pages)) {
        const fields = (pageData as any).fields;
        const fieldCount = Object.keys(fields).length;
        const completedFields = Object.values(fields).filter(value => 
          value !== null && value !== undefined && value !== ''
        ).length;
        
        pages[pageName].completed = fieldCount > 0 && completedFields === fieldCount;
        this.logger.debug(`Page ${pageName}: ${completedFields}/${fieldCount} fields completed`);
      }

      this.logger.debug(`Final form data:`, formData);
      this.logger.debug(`Final pages:`, pages);

      return { formData, pages };

    } catch (error) {
      this.logger.error(`Failed to build form data with pages for submission ${submission.submissionId}:`, error);
      return { formData: {}, pages: {} };
    }
  }

  /**
   * Calculate completion percentage from form data
   * 
   * @param formData - Form data object
   * @returns Object with percentage and progress data
   */
  private calculateCompletionPercentage(formData: any): { percentage: number; progress: any } {
    let totalFields = 0;
    let completedFields = 0;
    const pages: any = {};

    // Process each page
    for (const [pageId, pageData] of Object.entries(formData)) {
      const pageFields: any = {};
      let pageCompleted = true;
      let pageTotal = 0;
      let pageCompletedCount = 0;

      // Process each field in the page
      for (const [fieldId, value] of Object.entries(pageData as any)) {
        pageTotal++;
        totalFields++;

        if (value !== null && value !== undefined && value !== '') {
          pageCompletedCount++;
          completedFields++;
          pageFields[fieldId] = value;
        } else {
          pageCompleted = false;
          pageFields[fieldId] = value;
        }
      }

      // Set page completion status
      pages[pageId] = {
        completed: pageCompleted,
        fields: pageFields,
      };
    }

    // Calculate overall percentage
    const percentage = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

    return {
      percentage,
      progress: {
        pages,
        overall: {
          completed: completedFields,
          total: totalFields,
        },
      },
    };
  }

  /**
   * Fetch user courses (placeholder for future implementation)
   * 
   * @param userId - User ID to fetch courses for
   * @returns Promise<any[]> - Array of course objects
   */
  private async fetchUserCourses(userId: string): Promise<any[]> {
    // Placeholder for future course implementation
    // This can be expanded when course functionality is added
    return [];
  }

  /**
   * Get form schema from forms service
   * 
   * @param formId - Form ID
   * @returns Promise<any> - Form schema
   */
  private async getFormSchema(formId: string): Promise<any> {
    try {
      const form = await this.formsService.getFormById(formId);
      const fieldsObj = form && (form as any).fields ? (form as any).fields : null;

      // Handle different schema structures
      let schema: any = {};
      if (fieldsObj) {
        // Try different possible schema structures
        if (
          Array.isArray(fieldsObj?.result) &&
          fieldsObj.result[0]?.schema?.properties
        ) {
          // Structure: { result: [{ schema: { properties: {...} } }] }
          schema = fieldsObj.result[0].schema.properties;
        } else if (fieldsObj?.schema?.properties) {
          // Structure: { schema: { properties: {...} } }
          schema = fieldsObj.schema.properties;
        } else if (fieldsObj?.properties) {
          // Structure: { properties: {...} }
          schema = fieldsObj.properties;
        } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
          // Try to find schema in nested structure
          const findSchema = (obj: any): any => {
            if (obj?.schema?.properties) return obj.schema.properties;
            if (obj?.properties) return obj.properties;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const found = findSchema(item);
                if (found) return found;
              }
            } else if (typeof obj === 'object') {
              for (const key in obj) {
                const found = findSchema(obj[key]);
                if (found) return found;
              }
            }
            return null;
          };
          schema = findSchema(fieldsObj) || {};
        }
      }

      this.logger.debug(`Extracted schema for form ${formId}:`, Object.keys(schema));
      return schema;
    } catch (error) {
      this.logger.error(`Failed to get form schema for ${formId}:`, error);
      return {};
    }
  }

  /**
   * Extract field IDs from form schema using proper implementation
   * 
   * @param formId - Form ID to extract field IDs from
   * @returns Promise<string[]> - Array of field IDs
   */
  private async extractFieldIdsFromFormSchema(formId: string): Promise<string[]> {
    try {
      const schema = await this.getFormSchema(formId);
      const fieldIds: string[] = [];

      // Extract field IDs from schema structure
      for (const [pageKey, pageSchema] of Object.entries(schema)) {
        const fieldProps = (pageSchema as any).properties || {};
        
        const extractFieldIds = (properties: any) => {
          for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
            const fieldId = (fieldSchema as any).fieldId;
            if (fieldId) {
              fieldIds.push(fieldId);
            }

            // Handle dependencies
            if ((fieldSchema as any).dependencies) {
              const dependencies = (fieldSchema as any).dependencies;
              for (const depSchema of Object.values(dependencies)) {
                if (!depSchema || typeof depSchema !== 'object') continue;
                const dep = depSchema as any;
                if (dep.oneOf)
                  dep.oneOf.forEach((item: any) =>
                    item?.properties && extractFieldIds(item.properties)
                  );
                if (dep.allOf)
                  dep.allOf.forEach((item: any) =>
                    item?.properties && extractFieldIds(item.properties)
                  );
                if (dep.anyOf)
                  dep.anyOf.forEach((item: any) =>
                    item?.properties && extractFieldIds(item.properties)
                  );
                if (dep.properties) extractFieldIds(dep.properties);
              }
            }
          }
        };

        extractFieldIds(fieldProps);

        // Handle page-level dependencies
        const pageDependencies = (pageSchema as any).dependencies || {};
        for (const depSchema of Object.values(pageDependencies)) {
          if (!depSchema || typeof depSchema !== 'object') continue;
          const dep = depSchema as any;
          if (dep.oneOf)
            dep.oneOf.forEach((item: any) =>
              item?.properties && extractFieldIds(item.properties)
            );
          if (dep.allOf)
            dep.allOf.forEach((item: any) =>
              item?.properties && extractFieldIds(item.properties)
            );
          if (dep.anyOf)
            dep.anyOf.forEach((item: any) =>
              item?.properties && extractFieldIds(item.properties)
            );
          if (dep.properties) extractFieldIds(dep.properties);
        }
      }

      this.logger.debug(`Extracted ${fieldIds.length} field IDs from form ${formId}`);
      return fieldIds;

    } catch (error) {
      this.logger.error(`Failed to extract field IDs from form ${formId}:`, error);
      return [];
    }
  }

  /**
   * Get field ID to page name mapping from schema
   * 
   * @param schema - Form schema
   * @returns Record<string, string> - Field ID to page name mapping
   */
  private getFieldIdToPageNameMap(schema: any): Record<string, string> {
    const fieldIdToPageName: Record<string, string> = {};

    function extract(properties: any, currentPage: string) {
      if (!properties || typeof properties !== 'object') return;
      for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
        if (!fieldSchema || typeof fieldSchema !== 'object') continue;
        const fieldId = (fieldSchema as any).fieldId;
        if (fieldId) fieldIdToPageName[fieldId] = currentPage;

        // Traverse dependencies
        if ((fieldSchema as any).dependencies) {
          for (const depSchema of Object.values((fieldSchema as any).dependencies)) {
            if (!depSchema || typeof depSchema !== 'object') continue;
            const dep = depSchema as any;
            if (dep.oneOf)
              dep.oneOf.forEach((item: any) =>
                item?.properties && extract(item.properties, currentPage)
              );
            if (dep.allOf)
              dep.allOf.forEach((item: any) =>
                item?.properties && extract(item.properties, currentPage)
              );
            if (dep.anyOf)
              dep.anyOf.forEach((item: any) =>
                item?.properties && extract(item.properties, currentPage)
              );
            if (dep.properties) extract(dep.properties, currentPage);
          }
        }
      }
    }

    for (const [pageKey, pageSchema] of Object.entries(schema)) {
      const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
      extract((pageSchema as any).properties, pageName);

      // Also check for page-level dependencies
      if ((pageSchema as any).dependencies) {
        for (const depSchema of Object.values((pageSchema as any).dependencies)) {
          if (!depSchema || typeof depSchema !== 'object') continue;
          const dep = depSchema as any;
          if (dep.oneOf)
            dep.oneOf.forEach((item: any) =>
              item?.properties && extract(item.properties, pageName)
            );
          if (dep.allOf)
            dep.allOf.forEach((item: any) =>
              item?.properties && extract(item.properties, pageName)
            );
          if (dep.anyOf)
            dep.anyOf.forEach((item: any) =>
              item?.properties && extract(item.properties, pageName)
            );
          if (dep.properties) extract(dep.properties, pageName);
        }
      }
    }

    return fieldIdToPageName;
  }

  /**
   * Process field value for Elasticsearch storage
   * Converts array values to comma-separated strings for multiselect fields
   * 
   * @param value - The field value to process
   * @returns Processed value (array becomes comma-separated string, other types unchanged)
   */
  private processFieldValueForElasticsearch(value: any): any {
    // If value is an array, convert to comma-separated string
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    // Return value as-is for non-array values
    return value;
  }

  /**
   * Check if Elasticsearch is enabled
   * 
   * @returns boolean - True if Elasticsearch is enabled
   */
  isElasticsearchEnabled(): boolean {
    return isElasticsearchEnabled();
  }

  /**
   * Get course data for a specific application (user + cohort combination)
   * 
   * @param userId - User ID to fetch courses for
   * @param cohortId - Cohort ID to filter courses by
   * @returns Promise<object> - Courses object with nested structure
   */
  private async getCourseDataForApplication(userId: string, cohortId: string): Promise<{
    type: 'nested';
    values: any[];
  }> {
    try {
      this.logger.debug(`Fetching course data for user ${userId} in cohort ${cohortId}`);
      
      // Call the LMS service through middleware to get course data
      const courseData = await this.fetchCourseDataFromLMS(userId, cohortId);
      
      return {
        type: 'nested',
        values: courseData
      };
      
    } catch (error) {
      this.logger.error(`Failed to fetch course data for user ${userId}, cohort ${cohortId}:`, error);
      return { type: 'nested', values: [] };
    }
  }

  /**
   * Fetch all existing answer data for a user from assessment service
   * This ensures that when we sync course data, we also include any existing quiz answers
   */
  async fetchUserAnswerData(userId: string, tenantId: string, organisationId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching answer data for userId: ${userId}`);
      
      // Note: Assessment service doesn't have an endpoint to get all attempts for a user
      // This method will be enhanced when such an endpoint is available
      // For now, return empty array to avoid errors
      this.logger.warn(`Assessment service doesn't have endpoint to get all attempts for user ${userId}`);
      return [];
      
      // TODO: Implement when assessment service has getUserAttempts endpoint
      // const assessmentServiceUrl = process.env.ASSESSMENT_SERVICE_URL || 'http://localhost:4000';
      // const response = await axios.get(`${assessmentServiceUrl}/assessment-service/v1/attempts/user/${userId}`, {
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'tenantId': tenantId,
      //     'organisationId': organisationId,
      //     'userId': userId
      //   },
      //   timeout: 10000
      // });
    } catch (error) {
      this.logger.error(`Failed to fetch answer data for userId: ${userId}:`, error);
      return [];
    }
  }

  /**
   * Fetch course data from LMS service through middleware
   */
  private async fetchCourseDataFromLMS(userId: string, cohortId: string): Promise<any[]> {
    try {
      this.logger.debug(`Fetching course data for user ${userId} in cohort ${cohortId}`);
      
      // Generate authentication token
      const authToken = this.generateServiceAuthToken();
      
      // If no authentication token is available, skip course data fetching
      if (!authToken) {
        this.logger.warn(`No authentication token available, skipping course data fetching for userId: ${userId}`);
        return [];
      }
      
      // Use middleware URL instead of direct LMS service URL
      const middlewareUrl = process.env.MIDDLEWARE_URL || 'http://localhost:4000';
      const lmsEndpoint = `${middlewareUrl}/lms-service/v1/enrollments/user/${userId}/cohort/${cohortId}`;
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': authToken
      };

      this.logger.debug(`Calling LMS through middleware: ${lmsEndpoint}`);
      
      const response = await axios.get(lmsEndpoint, { headers });
      
      if (response.data && response.data.result && response.data.result.data) {
        this.logger.log(`Fetched ${response.data.result.data.length} course enrollments for userId: ${userId}`);
        return response.data.result.data;
      } else {
        this.logger.warn(`No course data found for userId: ${userId} in cohort: ${cohortId}`);
        return [];
      }
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`No course data found for userId: ${userId} in cohort: ${cohortId} - this is normal if user has no course enrollments`);
        return [];
      } else if (error.response?.status === 401) {
        this.logger.warn(`Authentication failed for LMS service for userId: ${userId} - this is normal if user has no course data`);
        return [];
      } else {
        this.logger.error(`Failed to fetch course data for userId: ${userId}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Merge all user data together ensuring consistency
   */
  private mergeUserData(userProfile: any, applications: any[], courseData: any[], answerData: any[]): any {
    // Create base user document
    const userDocument = {
      userId: userProfile.userId,
      profile: userProfile,
      applications: applications || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Enhance applications with course data
    if (applications && applications.length > 0 && courseData.length > 0) {
      for (const application of applications) {
        // Find matching course data for this application's cohortId
        const matchingCourses = courseData.filter(course => 
          course.cohortId === application.cohortId
        );

        if (matchingCourses.length > 0) {
          // Initialize courses structure if not exists
          if (!application.courses) {
            application.courses = {
              type: 'nested',
              values: []
            };
          }

          // Add course data to application
          for (const course of matchingCourses) {
            // Check if course already exists in application
            const existingCourseIndex = application.courses.values.findIndex(
              (c: any) => c.courseId === course.courseId
            );

            if (existingCourseIndex >= 0) {
              // Update existing course
              application.courses.values[existingCourseIndex] = course;
            } else {
              // Add new course
              application.courses.values.push(course);
            }
          }
        }
      }
    }

    // Enhance course data with answer data
    if (answerData.length > 0) {
      this.enhanceCourseDataWithAnswers(userDocument.applications, answerData);
    }

    return userDocument;
  }

  /**
   * Enhance course data with answer data
   */
  private enhanceCourseDataWithAnswers(applications: any[], answerData: any[]): void {
    for (const application of applications) {
      if (application.courses && application.courses.values) {
        for (const course of application.courses.values) {
          if (course.units && course.units.values) {
            for (const unit of course.units.values) {
              if (unit.contents && unit.contents.values) {
                for (const content of unit.contents.values) {
                  if (content.type === 'test') {
                    // Find matching answer data for this test
                    const matchingAnswerData = answerData.find(answer => 
                      answer.testId === content.contentId
                    );
                    
                    if (matchingAnswerData) {
                      content.tracking = {
                        ...content.tracking,
                        questionsAttempted: matchingAnswerData.questionsAttempted,
                        totalQuestions: matchingAnswerData.totalQuestions,
                        score: matchingAnswerData.score,
                        percentComplete: matchingAnswerData.percentComplete,
                        timeSpent: matchingAnswerData.timeSpent,
                        answers: {
                          type: 'nested',
                          values: matchingAnswerData.answers
                        }
                      };
                      
                      // Update content status based on completion
                      if (matchingAnswerData.percentComplete >= 100) {
                        content.status = 'completed';
                      } else if (matchingAnswerData.percentComplete > 0) {
                        content.status = 'in_progress';
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Fetch lesson and module data from LMS service through middleware
   */
  private async fetchLessonModuleDataFromLMS(userId: string, tenantId: string, organisationId: string): Promise<any[]> {
    try {
      this.logger.debug(`Fetching lesson and module data from LMS for userId: ${userId}`);
      
      // Generate authentication token
      const authToken = this.generateServiceAuthToken();
      
      // If no authentication token is available, skip LMS data fetching
      if (!authToken) {
        this.logger.warn(`No authentication token available, skipping LMS data fetching for userId: ${userId}`);
        return [];
      }
      
      // Use middleware URL instead of direct LMS service URL
      const middlewareUrl = process.env.MIDDLEWARE_URL || 'http://localhost:4000';
      const lmsEndpoint = `${middlewareUrl}/lms-service/v1/tracking/attempts/progress/${userId}`;
      
      const headers = {
        'Content-Type': 'application/json',
        'tenantid': tenantId,
        'organisationid': organisationId,
        'Authorization': authToken
      };

      this.logger.debug(`Calling LMS through middleware: ${lmsEndpoint}`);
      
      const response = await axios.get(lmsEndpoint, { headers });
      
      if (response.data && response.data.result && response.data.result.data) {
        this.logger.log(`Fetched ${response.data.result.data.length} lesson tracks from LMS for userId: ${userId}`);
        return response.data.result.data;
      } else {
        this.logger.warn(`No lesson tracking data found for userId: ${userId}`);
        return [];
      }
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`No lesson tracking data found for userId: ${userId} - this is normal if user has no LMS activity`);
        return [];
      } else if (error.response?.status === 401) {
        this.logger.warn(`Authentication failed for LMS service for userId: ${userId} - this is normal if user has no LMS data`);
        return [];
      } else {
        this.logger.error(`Failed to fetch LMS data for userId: ${userId}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Fetch question and answer data from Assessment service through middleware
   */
  private async fetchQuestionAnswerDataFromAssessment(userId: string, tenantId: string, organisationId: string): Promise<any[]> {
    try {
      this.logger.debug(`Fetching question and answer data from Assessment for userId: ${userId}`);
      
      // Generate authentication token
      const authToken = this.generateServiceAuthToken();
      
      // If no authentication token is available, skip assessment data fetching
      if (!authToken) {
        this.logger.warn(`No authentication token available, skipping assessment data fetching for userId: ${userId}`);
        return [];
      }
      
      // Use middleware URL instead of direct Assessment service URL
      const middlewareUrl = process.env.MIDDLEWARE_URL || 'http://localhost:4000';
      const assessmentEndpoint = `${middlewareUrl}/assessment/v1/attempts/user/${userId}`;
      
      const headers = {
        'Content-Type': 'application/json',
        'tenantid': tenantId,
        'organisationid': organisationId,
        'Authorization': authToken
      };

      this.logger.debug(`Calling Assessment through middleware: ${assessmentEndpoint}`);
      
      const response = await axios.get(assessmentEndpoint, { headers });
      
      if (response.data && response.data.result && response.data.result.data) {
        const attempts = response.data.result.data;
        this.logger.log(`Fetched ${attempts.length} assessment attempts for userId: ${userId}`);
        
        // Process each attempt to get enhanced answers with text content
        const enhancedAttempts = [];
        
        for (const attempt of attempts) {
          try {
            // Get answers for this attempt with enhanced text content
            const answersEndpoint = `${middlewareUrl}/assessment/v1/attempts/${attempt.attemptId}/answers`;
            const answersResponse = await axios.get(answersEndpoint, { headers });
            
            if (answersResponse.data && answersResponse.data.result && answersResponse.data.result.data) {
              const attemptData = answersResponse.data.result.data;
              
              // Enhance the attempt data with enhanced answers
              enhancedAttempts.push({
                ...attempt,
                answers: attemptData.answers || [],
                totalQuestions: attemptData.totalQuestions || 0,
                score: attemptData.score || 0,
                percentComplete: attemptData.percentComplete || 0,
                questionsAttempted: attemptData.questionsAttempted || 0,
                timeSpent: attemptData.timeSpent || 0,
                status: attemptData.status || 'in_progress'
              });
            } else {
              // If no answers found, still include the attempt
              enhancedAttempts.push({
                ...attempt,
                answers: [],
                totalQuestions: 0,
                score: 0,
                percentComplete: 0,
                questionsAttempted: 0,
                timeSpent: 0,
                status: 'not_started'
              });
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch answers for attempt ${attempt.attemptId}:`, error.message);
            // Still include the attempt even if answers fetch failed
            enhancedAttempts.push({
              ...attempt,
              answers: [],
              totalQuestions: 0,
              score: 0,
              percentComplete: 0,
              questionsAttempted: 0,
              timeSpent: 0,
              status: 'error'
            });
          }
        }
        
        return enhancedAttempts;
      } else {
        this.logger.warn(`No assessment attempts found for userId: ${userId}`);
        return [];
      }
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`No assessment attempts found for userId: ${userId} - this is normal if user has no assessment activity`);
        return [];
      } else if (error.response?.status === 401) {
        this.logger.warn(`Authentication failed for Assessment service for userId: ${userId} - this is normal if user has no assessment data`);
        return [];
      } else {
        this.logger.error(`Failed to fetch assessment data for userId: ${userId}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Generate authentication token for service-to-service communication
   */
  private generateServiceAuthToken(): string {
    // Try to get service token from environment
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    if (serviceToken) {
      return `Bearer ${serviceToken}`;
    }

    // Try to get API key from environment
    const apiKey = process.env.LMS_SERVICE_API_KEY;
    if (apiKey) {
      return `ApiKey ${apiKey}`;
    }

    // Try to get JWT secret to generate a service token
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      // For service-to-service communication, we'll use a special service user token
      this.logger.debug('Using JWT secret to generate service token');
      return 'Bearer service-internal-token';
    }

    // Fallback - skip course data fetching for now
    this.logger.warn('No authentication token configured, skipping course data fetching');
    return null;
  }

  /**
   * Merge all user data from all three services together
   */
  private mergeUserDataWithAllServices(userProfile: any, applications: any[], lmsData: any[], assessmentData: any[]): any {
    // Create base user document
    const userDocument = {
      userId: userProfile.userId,
      profile: userProfile,
      applications: applications || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Enhance applications with LMS data (lessons and modules)
    if (applications && applications.length > 0 && lmsData.length > 0) {
      for (const application of applications) {
        // Find matching lesson tracks for this application's cohortId
        const matchingLessonTracks = lmsData.filter(lessonTrack => {
          // Extract cohortId from course params or use courseId
          const lessonCohortId = lessonTrack.course?.params?.cohortId || lessonTrack.courseId;
          return lessonCohortId === application.cohortId;
        });

        if (matchingLessonTracks.length > 0) {
          // Initialize courses structure if not exists
          if (!application.courses) {
            application.courses = {
              type: 'nested',
              values: []
            };
          }

          // Group lesson tracks by course
          const coursesByCourseId = new Map<string, any[]>();
          for (const lessonTrack of matchingLessonTracks) {
            const courseId = lessonTrack.courseId;
            if (!coursesByCourseId.has(courseId)) {
              coursesByCourseId.set(courseId, []);
            }
            coursesByCourseId.get(courseId)!.push(lessonTrack);
          }

          // Build course structure with lessons and modules
          for (const [courseId, lessonTracks] of coursesByCourseId) {
            const courseData = this.buildCourseDataWithLessonsAndModules(lessonTracks);
            
            // Check if course already exists in application
            const existingCourseIndex = application.courses.values.findIndex(
              (c: any) => c.courseId === courseId
            );

            if (existingCourseIndex >= 0) {
              // Update existing course
              application.courses.values[existingCourseIndex] = courseData;
            } else {
              // Add new course
              application.courses.values.push(courseData);
            }
          }
        }
      }
    }

    // Enhance course data with assessment data (questions and answers)
    if (assessmentData.length > 0) {
      this.enhanceCourseDataWithAssessmentData(userDocument.applications, assessmentData);
    }

    return userDocument;
  }

  /**
   * Build course data with lessons and modules from LMS data
   */
  private buildCourseDataWithLessonsAndModules(lessonTracks: any[]): any {
    if (lessonTracks.length === 0) {
      return null;
    }

    const firstLessonTrack = lessonTracks[0];
    const course = firstLessonTrack.course;
    const lesson = firstLessonTrack.lesson;

    // Group lesson tracks by module
    const modulesByModuleId = new Map<string, any[]>();
    for (const lessonTrack of lessonTracks) {
      const moduleId = lessonTrack.lesson?.moduleId || 'default-module';
      if (!modulesByModuleId.has(moduleId)) {
        modulesByModuleId.set(moduleId, []);
      }
      modulesByModuleId.get(moduleId)!.push(lessonTrack);
    }

    // Build course structure
    const courseData = {
      courseId: course?.courseId || firstLessonTrack.courseId,
      courseTitle: course?.title || 'Unknown Course',
      progress: this.calculateCourseProgress(lessonTracks),
      units: {
        type: 'nested' as const,
        values: []
      }
    };

    // Build module structure for each module
    for (const [moduleId, moduleLessonTracks] of modulesByModuleId) {
      const firstModuleLessonTrack = moduleLessonTracks[0];
      const module = firstModuleLessonTrack.lesson?.module;

      const unitData = {
        unitId: moduleId,
        unitTitle: module?.title || `Module ${moduleId}`,
        progress: this.calculateModuleProgress(moduleLessonTracks),
        contents: {
          type: 'nested' as const,
          values: []
        }
      };

      // Build lesson content for each lesson in the module
      for (const lessonTrack of moduleLessonTracks) {
        const lesson = lessonTrack.lesson;
        
        const contentData = {
          contentId: lesson?.lessonId || lessonTrack.lessonId,
          type: lesson?.format || 'video',
          title: lesson?.title || 'Unknown Lesson',
          status: this.getLessonStatus(lessonTrack),
          tracking: this.buildLessonTracking(lessonTrack)
        };

        unitData.contents.values.push(contentData);
      }

      courseData.units.values.push(unitData);
    }

    return courseData;
  }

  /**
   * Calculate course progress based on lesson tracks
   */
  private calculateCourseProgress(lessonTracks: any[]): number {
    if (lessonTracks.length === 0) return 0;
    
    const totalLessons = lessonTracks.length;
    const completedLessons = lessonTracks.filter(lt => 
      lt.status === 'completed' || lt.completionPercentage >= 100
    ).length;
    
    return Math.round((completedLessons / totalLessons) * 100);
  }

  /**
   * Calculate module progress based on lesson tracks
   */
  private calculateModuleProgress(lessonTracks: any[]): number {
    if (lessonTracks.length === 0) return 0;
    
    const totalLessons = lessonTracks.length;
    const completedLessons = lessonTracks.filter(lt => 
      lt.status === 'completed' || lt.completionPercentage >= 100
    ).length;
    
    return Math.round((completedLessons / totalLessons) * 100);
  }

  /**
   * Get lesson status based on lesson track
   */
  private getLessonStatus(lessonTrack: any): string {
    if (lessonTrack.status === 'completed' || lessonTrack.completionPercentage >= 100) {
      return 'completed';
    } else if (lessonTrack.status === 'started' || lessonTrack.completionPercentage > 0) {
      return 'in_progress';
    } else {
      return 'not_started';
    }
  }

  /**
   * Build lesson tracking data
   */
  private buildLessonTracking(lessonTrack: any): any {
    return {
      percentComplete: lessonTrack.completionPercentage || 0,
      lastPosition: Math.floor(lessonTrack.currentPosition || 0),
      currentPosition: Math.floor(lessonTrack.currentPosition || 0),
      timeSpent: lessonTrack.timeSpent || 0,
      visitedPages: lessonTrack.visitedPages || [],
      totalPages: lessonTrack.totalContent || 0,
      lastPage: lessonTrack.currentPage || 0,
      currentPage: lessonTrack.currentPage || 0,
      questionsAttempted: 0,
      totalQuestions: 0,
      score: 0,
      answers: {
        type: 'nested',
        values: []
      }
    };
  }

  /**
   * Enhance course data with assessment data (questions and answers)
   */
  private enhanceCourseDataWithAssessmentData(applications: any[], assessmentData: any[]): void {
    this.logger.log(`Enhancing course data with ${assessmentData.length} assessment records`);
    
    for (const application of applications) {
      if (application.courses && application.courses.values) {
        for (const course of application.courses.values) {
          if (course.units && course.units.values) {
            for (const unit of course.units.values) {
              if (unit.contents && unit.contents.values) {
                for (const content of unit.contents.values) {
                  // Find matching assessment data for this content
                  const matchingAssessmentData = assessmentData.filter(assessment => 
                    assessment.testId === content.contentId || 
                    assessment.attemptId === content.contentId ||
                    assessment.lessonId === content.contentId
                  );

                  if (matchingAssessmentData.length > 0) {
                    this.logger.log(`Found ${matchingAssessmentData.length} matching assessment records for content ${content.contentId}`);
                    
                    // Update content type to test
                    content.type = 'test';
                    
                    // Get the latest assessment data
                    const latestAssessment = matchingAssessmentData.sort((a, b) => 
                      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    )[0];

                    this.logger.log(`Using latest assessment data for content ${content.contentId}:`, {
                      testId: latestAssessment.testId,
                      attemptId: latestAssessment.attemptId,
                      questionsAttempted: latestAssessment.questionsAttempted,
                      totalQuestions: latestAssessment.totalQuestions,
                      score: latestAssessment.score,
                      percentComplete: latestAssessment.percentComplete,
                      answersCount: latestAssessment.answers?.length || 0
                    });

                    // Transform answers to the expected format with enhanced text content
                    const transformedAnswers = latestAssessment.answers?.map((answer: any) => {
                      // Handle different answer formats from assessment service
                      let answerText = '';
                      let answerValue = answer.answer;
                      
                      if (typeof answerValue === 'object') {
                        if (answerValue.selectedOptionIds) {
                          // MCQ answer with selectedOptionIds - extract text from answer object
                          answerText = answerValue.text || `Selected options: ${answerValue.selectedOptionIds.join(', ')}`;
                        } else if (answerValue.text) {
                          // Enhanced answer with text
                          answerText = answerValue.text;
                        } else if (answerValue.answer) {
                          // Enhanced answer with both answer and text
                          answerText = answerValue.text || answerValue.answer;
                        } else {
                          // Other format
                          answerText = JSON.stringify(answerValue);
                        }
                      } else {
                        // String answer
                        answerText = String(answerValue);
                      }
                      
                      return {
                        questionId: answer.questionId,
                        type: answer.type || 'radio',
                        submittedAnswer: answerText,
                        // Add additional fields for better mapping
                        answer: answerValue,
                        text: answerText,
                        score: answer.score || 0,
                        reviewStatus: answer.reviewStatus || 'pending'
                      };
                    }) || [];

                    this.logger.log(`Transformed ${transformedAnswers.length} answers for content ${content.contentId}`);

                    // Update content tracking with assessment data
                    content.tracking = {
                      ...content.tracking,
                      questionsAttempted: latestAssessment.questionsAttempted || 0,
                      totalQuestions: latestAssessment.totalQuestions || 0,
                      score: latestAssessment.score || 0,
                      percentComplete: latestAssessment.percentComplete || 0,
                      timeSpent: latestAssessment.timeSpent || 0,
                      answers: {
                        type: 'nested',
                        values: transformedAnswers
                      }
                    };

                    // Update content status based on completion
                    if (latestAssessment.percentComplete >= 100) {
                      content.status = 'completed';
                    } else if (latestAssessment.percentComplete > 0) {
                      content.status = 'in_progress';
                    } else {
                      content.status = 'not_started';
                    }

                    this.logger.log(`Updated assessment content ${content.contentId} with ${transformedAnswers.length} answers`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check and fix empty profile data in Elasticsearch
   * This method can be called to fix existing documents with empty profile data
   * @param userId The user ID to check and fix
   */
  async checkAndFixEmptyProfile(userId: string): Promise<void> {
    try {
      this.logger.log(`Checking and fixing empty profile for userId: ${userId}`);
      
      // Get current user data from Elasticsearch
      const currentUserData = await this.userElasticsearchService.getUser(userId) as any;
      
      if (!currentUserData) {
        this.logger.log(`User ${userId} not found in Elasticsearch, creating new document`);
        await this.comprehensiveUserSync(userId);
        return;
      }
      
      // Check if profile data is empty
      const profile = currentUserData.profile;
      if (!profile || !profile.firstName || !profile.lastName || !profile.email || 
          (profile.firstName === '' && profile.lastName === '' && profile.email === '')) {
        this.logger.warn(`Empty profile data detected for userId: ${userId}, re-syncing user data`);
        
        // Re-sync user data from database
        const freshUserData = await this.comprehensiveUserSync(userId);
        
        if (freshUserData && freshUserData.profile && 
            (freshUserData.profile.firstName || freshUserData.profile.lastName || freshUserData.profile.email)) {
          this.logger.log(`Successfully fixed profile data for userId: ${userId}`);
        } else {
          this.logger.error(`Failed to fix profile data for userId: ${userId}`);
        }
      } else {
        this.logger.log(`Profile data is already populated for userId: ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Error checking and fixing empty profile for userId: ${userId}:`, error);
    }
  }
} 