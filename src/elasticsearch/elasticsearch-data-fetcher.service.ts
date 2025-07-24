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
  ) {}

  /**
   * Fetch complete user document for Elasticsearch from database
   * This is the main function that fetches all required data for a user
   * 
   * @param userId - The user ID to fetch data for
   * @returns Promise<IUser | null> - Complete user document or null if user not found
   */
  async fetchUserDocumentForElasticsearch(userId: string): Promise<IUser | null> {
    try {
      this.logger.debug(`Fetching user document for Elasticsearch: ${userId}`);

      // Fetch user from database
      const user = await this.userRepository.findOne({ where: { userId } });
      if (!user) {
        this.logger.warn(`User not found in database: ${userId}`);
        return null;
      }

      // Fetch profile data (including custom fields)
      const profile = await this.fetchUserProfile(user);

      // Fetch applications data
      const applications = await this.fetchUserApplications(userId);

      // Fetch courses data (placeholder for future implementation)
      const courses = await this.fetchUserCourses(userId);

      // Create complete user document
      const userDocument: IUser = {
        userId: user.userId,
        profile,
        applications,
        courses,
        createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: user.updatedAt ? user.updatedAt.toISOString() : new Date().toISOString(),
      };

      this.logger.debug(`Successfully fetched user document for: ${userId}`);
      return userDocument;

    } catch (error) {
      this.logger.error(`Failed to fetch user document for ${userId}:`, error);
      throw new Error(`Failed to fetch user document: ${error.message}`);
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
      // Fetch custom fields for the user
      const customFields = await this.fetchUserCustomFields(user.userId);

      // Format date of birth
      let formattedDob: string | null = null;
      if (user.dob instanceof Date) {
        formattedDob = user.dob.toISOString();
      } else if (typeof user.dob === 'string') {
        formattedDob = user.dob;
      }

      // Create profile object
      const profile: IProfile = {
        userId: user.userId,
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        middleName: user.middleName || '',
        email: user.email || '',
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

      return profile;

    } catch (error) {
      this.logger.error(`Failed to fetch user profile for ${user.userId}:`, error);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
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
  private async fetchUserApplications(userId: string): Promise<any[]> {
    try {
      // Fetch all cohort memberships for this user
      const cohortMemberships = await this.cohortMembersRepository.find({
        where: { userId },
      });

      this.logger.debug(`Found ${cohortMemberships.length} cohort memberships for user ${userId}`);
      
      // Log cohort membership details for debugging
      if (cohortMemberships.length > 0) {
        this.logger.debug(`Cohort membership details:`, cohortMemberships.map(membership => ({
          cohortId: membership.cohortId,
          userId: membership.userId,
          status: membership.status,
          cohortMembershipId: membership.cohortMembershipId
        })));
      }

      // Fetch all form submissions for this user
      const submissions = await this.formSubmissionRepository.find({
        where: { itemId: userId },
      });

      this.logger.debug(`Found ${submissions.length} form submissions for user ${userId}`);
      
      // Log submission details for debugging
      if (submissions.length > 0) {
        this.logger.debug(`Submission details:`, submissions.map(sub => ({
          formId: sub.formId,
          itemId: sub.itemId,
          status: sub.status,
          updatedAt: sub.updatedAt
        })));
      }

      const applications: any[] = [];

      // Process each cohort membership
      for (const membership of cohortMemberships) {
        const application = await this.buildApplicationForCohort(
          userId,
          membership,
          submissions
        );
        
        if (application) {
          applications.push(application);
        }
      }

      // If no cohort memberships but form submissions exist, create a default application
      if (applications.length === 0 && submissions.length > 0) {
        this.logger.debug(`Creating default application for user ${userId} with form submissions`);
        
        for (const submission of submissions) {
          const defaultApplication = {
            cohortId: submission.formId || 'default',
            cohortmemberstatus: 'active',
            formstatus: submission.status || 'inactive',
            completionPercentage: 0,
            progress: {
              pages: {},
              overall: {
                completed: 0,
                total: 0,
              },
            },
            lastSavedAt: submission.updatedAt ? submission.updatedAt.toISOString() : null,
            submittedAt: null,
            cohortDetails: {
              name: `Form ${submission.formId}`,
              description: '',
              startDate: null,
              endDate: null,
              status: 'active',
            },
            formData: await this.buildFormDataFromSubmission(submission),
          };
          
          applications.push(defaultApplication);
        }
      }

      this.logger.debug(`Returning ${applications.length} applications for user ${userId}`);
      return applications;

    } catch (error) {
      this.logger.error(`Failed to fetch applications for ${userId}:`, error);
      return [];
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
      // Find form submission for this cohort
      // Note: FormSubmission doesn't have cohortId, so we'll use itemId to match user
      const submission = submissions.find(sub => sub.itemId === userId);
      
      if (!submission) {
        this.logger.warn(`No form submission found for user ${userId} in cohort ${membership.cohortId}`);
        return null;
      }

      // Build form data with proper page structure
      const formData = await this.buildFormDataWithPages(submission);

      // Calculate completion percentage and progress
      const { percentage, progress } = this.calculateCompletionPercentage(formData);

      // Fetch cohort details
      const cohort = await this.cohortRepository.findOne({
        where: { cohortId: membership.cohortId },
      });

      return {
        cohortId: membership.cohortId,
        formId: submission.formId,
        submissionId: submission.submissionId,
        cohortmemberstatus: membership.status || 'active',
        formstatus: submission.status || 'active',
        completionPercentage: percentage,
        progress,
        lastSavedAt: submission.updatedAt ? submission.updatedAt.toISOString() : null,
        submittedAt: submission.status === 'active' ? submission.updatedAt?.toISOString() : null,
        cohortDetails: {
          name: cohort?.name || 'Unknown Cohort',
          description: '', // Cohort entity doesn't have description field
          startDate: null, // Cohort entity doesn't have startDate field
          endDate: null, // Cohort entity doesn't have endDate field
          status: cohort?.status || 'active',
        },
        formData,
      };

    } catch (error) {
      this.logger.error(`Failed to build application for cohort ${membership.cohortId}:`, error);
      return null;
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
      // Fetch field values for this submission
      const fieldValues = await this.fieldValuesRepository.find({
        where: { 
          itemId: submission.itemId,
        },
        relations: ['field'],
      });

      // Get form schema to build proper page structure
      const formSchema = await this.getFormSchema(submission.formId);
      const fieldIdToPageName = this.getFieldIdToPageNameMap(formSchema);

      // Build page structure
      const formData: any = {};
      const pages: any = {};

      // Initialize pages from schema
      for (const [pageKey, pageSchema] of Object.entries(formSchema)) {
        const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
        pages[pageName] = { completed: true, fields: {} };
        formData[pageName] = {};
      }

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
      }

      // Update page completion status
      for (const [pageName, pageData] of Object.entries(pages)) {
        const fields = (pageData as any).fields;
        const fieldCount = Object.keys(fields).length;
        const completedFields = Object.values(fields).filter(value => 
          value !== null && value !== undefined && value !== ''
        ).length;
        
        pages[pageName].completed = fieldCount > 0 && completedFields === fieldCount;
      }

      return formData;

    } catch (error) {
      this.logger.error(`Failed to build form data with pages for submission ${submission.submissionId}:`, error);
      return {};
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
} 