import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { IUser, IProfile, IApplication } from './interfaces/user.interface';
import { isElasticsearchEnabled } from '../common/utils/elasticsearch.util';
import { LoggerUtil } from '../common/logger/LoggerUtil';
import { User } from '../user/entities/user-entity';

/**
 * Elasticsearch Sync Service
 * 
 * This service consolidates all Elasticsearch synchronization operations
 * from user-adapter.ts, cohortMembers-adapter.ts, and form-submission.service.ts.
 * 
 * Key Features:
 * - Unified user profile synchronization
 * - Application data synchronization
 * - Cohort member status updates
 * - Form submission data updates
 * - Dynamic field filtering and processing
 * - Comprehensive error handling and logging
 * - Configurable operations with fallback mechanisms
 * 
 * Usage:
 * - Inject this service in place of direct UserElasticsearchService calls
 * - Use the provided methods for all Elasticsearch operations
 * - Configure field filtering and data processing as needed
 */
@Injectable()
export class ElasticsearchSyncService {

  constructor(
    private readonly userElasticsearchService: UserElasticsearchService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  /**
   * Sync user profile to Elasticsearch with comprehensive data fetching
   * 
   * @param userId - User ID to sync
   * @param profileData - Profile data to sync (optional, will fetch from DB if not provided)
   * @param customFieldsProvider - Function to get custom fields (optional)
   * @param applicationDataProvider - Function to get application data (optional)
   * @returns Promise<void>
   */
  /**
   * Sync user profile to Elasticsearch with custom fields support
   * 
   * @param userId - User ID to sync
   * @param profileData - Profile data to sync (optional, will fetch from DB if not provided)
   * @param customFieldsProvider - Function to get custom fields (optional)
   * @param applicationDataProvider - Function to get application data (optional)
   * @returns Promise<void>
   */
  async syncUserProfile(
    userId: string,
    profileData?: Partial<IProfile>,
    customFieldsProvider?: (userId: string) => Promise<any[]>,
    applicationDataProvider?: (userId: string) => Promise<IApplication[]>
  ): Promise<void> {
    if (!isElasticsearchEnabled()) {
      LoggerUtil.debug(`Elasticsearch disabled, skipping sync for user: ${userId}`, 'ElasticsearchSyncService');
      return;
    }

    try {
      LoggerUtil.debug(`Starting user profile sync for: ${userId}`, 'ElasticsearchSyncService');

      // Always build complete profile with custom fields
      const profile = await this.buildUserProfile(userId, customFieldsProvider);

      // If profileData is provided, merge it with the built profile (but preserve customFields)
      if (profileData) {
        Object.assign(profile, profileData);
        // Ensure customFields are preserved from the built profile
        if (customFieldsProvider) {
          const customFields = await customFieldsProvider(userId);
          profile.customFields = this.processCustomFieldsForElasticsearch(customFields);
        }
      }

      // Get application data if provider is available
      const applications = applicationDataProvider 
        ? await applicationDataProvider(userId)
        : [];

      LoggerUtil.debug(`Built ${applications.length} applications for user: ${userId}`, 'ElasticsearchSyncService');

      // Build complete user document
      const userDocument: IUser = {
        userId,
        profile, // Remove unnecessary type assertion
        applications,
        courses: [], // Default empty courses array
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update or create user document in Elasticsearch with full document including applications
      await this.userElasticsearchService.updateUser(
        userId,
        { doc: userDocument },
        async (userId: string) => {
          // Fallback: fetch complete user document if needed
          return await this.buildCompleteUserDocument(userId, customFieldsProvider, applicationDataProvider);
        }
      );

      LoggerUtil.debug(`Successfully synced user profile for: ${userId}`, 'ElasticsearchSyncService');
    } catch (error) {
      LoggerUtil.error('Failed to sync user profile to Elasticsearch', error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
      // Don't throw error to prevent affecting main flow
    }
  }

  /**
   * Sync user application to Elasticsearch
   * 
   * @param userId - User ID
   * @param cohortId - Cohort ID
   * @param updateData - Data to update
   * @param applicationDataProvider - Function to get complete application data
   * @returns Promise<void>
   */
  async syncUserApplication(
    userId: string,
    cohortId: string,
    updateData: {
      cohortmemberstatus?: string;
      statusReason?: string;
      completionPercentage?: number;
      formstatus?: string;
      formData?: any;
      progress?: any;
    },
    applicationDataProvider?: (userId: string, cohortId: string) => Promise<IApplication>
  ): Promise<void> {
    if (!isElasticsearchEnabled()) {
      LoggerUtil.debug(`Elasticsearch disabled, skipping application sync for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');
      return;
    }

    try {
      LoggerUtil.debug(`Starting application sync for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');

      // Get existing user document from Elasticsearch
      const userDoc = await this.userElasticsearchService.getUser(userId);
      
      // Extract the application array if present using optional chaining
      const source = userDoc?._source as { applications?: any[] } | undefined;
      
      const existingApplication = source?.applications?.find(app => app.cohortId === cohortId);

      if (!existingApplication) {
        // If application is missing, build and upsert the full user document
        if (applicationDataProvider) {
          const fullUserDoc = await applicationDataProvider(userId, cohortId);
          if (fullUserDoc) {
            const userDocument = await this.buildCompleteUserDocument(
              userId,
              undefined,
              async () => [fullUserDoc]
            );
            
            await this.userElasticsearchService.updateUser(
              userId,
              { doc: userDocument },
              async () => userDocument
            );
          }
        }
      } else {
        // Use the common method for field-specific update to preserve existing data
        await this.handleApplicationUpdate(userId, cohortId, updateData, applicationDataProvider, 'sync');
      }

      LoggerUtil.debug(`Successfully synced application for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');
    } catch (error) {
      LoggerUtil.error('Failed to sync user application to Elasticsearch', error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
      // Don't throw error to prevent affecting main flow
    }
  }

  /**
   * Update application data in Elasticsearch for a specific cohort
   * 
   * @param userId - User ID
   * @param cohortId - Cohort ID
   * @param updateData - Data to update
   * @param applicationDataProvider - Function to get complete application data
   * @returns Promise<void>
   */
  async updateApplicationData(
    userId: string,
    cohortId: string,
    updateData: {
      cohortmemberstatus?: string;
      statusReason?: string;
      completionPercentage?: number;
      formstatus?: string;
      formData?: any;
      progress?: any;
    },
    applicationDataProvider?: (userId: string, cohortId: string) => Promise<IApplication>
  ): Promise<void> {
    await this.handleApplicationUpdate(userId, cohortId, updateData, applicationDataProvider, 'update');
  }

  /**
   * Common method to handle application updates and syncs
   * 
   * @param userId - User ID
   * @param cohortId - Cohort ID
   * @param updateData - Data to update
   * @param applicationDataProvider - Function to get complete application data
   * @param operationType - Type of operation ('sync' or 'update')
   * @returns Promise<void>
   */
  private async handleApplicationUpdate(
    userId: string,
    cohortId: string,
    updateData: {
      cohortmemberstatus?: string;
      statusReason?: string;
      completionPercentage?: number;
      formstatus?: string;
      formData?: any;
      progress?: any;
    },
    applicationDataProvider?: (userId: string, cohortId: string) => Promise<IApplication>,
    operationType: 'sync' | 'update' = 'update'
  ): Promise<void> {
    if (!isElasticsearchEnabled()) {
      LoggerUtil.debug(`Elasticsearch disabled, skipping application ${operationType} for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');
      return;
    }

    try {
      LoggerUtil.debug(`${operationType === 'update' ? 'Updating' : 'Starting'} application ${operationType} for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');

      // Create Painless script for field-specific updates
      const script = this.buildApplicationUpdateScript(cohortId, updateData);

      // Check if user document exists
      const userDoc = await this.userElasticsearchService.getUser(userId);

      if (userDoc) {
        // Update existing document with field-specific changes
        await this.userElasticsearchService.updateUser(
          userId,
          { script },
          async (userId: string) => {
            return await this.buildCompleteUserDocument(userId);
          }
        );
      } else {
        // Create new user document if it doesn't exist
        const fullUserDoc = await this.buildCompleteUserDocument(userId);
        if (fullUserDoc) {
          await this.userElasticsearchService.updateUser(
            userId,
            { doc: fullUserDoc },
            async (userId: string) => {
              return await this.buildCompleteUserDocument(userId);
            }
          );
        }
      }

      LoggerUtil.debug(`Successfully ${operationType === 'update' ? 'updated' : 'synced'} application ${operationType === 'update' ? 'data' : ''} for user: ${userId}, cohort: ${cohortId}`, 'ElasticsearchSyncService');
    } catch (error) {
      LoggerUtil.error(`Failed to ${operationType} application ${operationType === 'update' ? 'data' : ''} in Elasticsearch`, error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
      // Don't throw error to prevent affecting main flow
    }
  }

  /**
   * Sync form submission data to Elasticsearch
   * 
   * @param userId - User ID
   * @param submissionData - Form submission data including cohortId
   * @param cohortDetailsProvider - Function to get cohort details (expects cohortId, not formId)
   * @returns Promise<void>
   */
  async syncFormSubmissionData(
    userId: string,
    submissionData: {
      formId: string;
      submissionId: string;
      cohortId: string; // Added proper cohortId parameter
      formstatus: string;
      completionPercentage: number;
      formData: any;
      progress: any;
      lastSavedAt: string;
      submittedAt: string;
    },
    cohortDetailsProvider?: (cohortId: string) => Promise<any>
  ): Promise<void> {
    if (!isElasticsearchEnabled()) {
      LoggerUtil.debug(`Elasticsearch disabled, skipping form submission sync for user: ${userId}`, 'ElasticsearchSyncService');
      return;
    }

    try {
      LoggerUtil.debug(`Syncing form submission data for user: ${userId}, form: ${submissionData.formId}, cohort: ${submissionData.cohortId}`, 'ElasticsearchSyncService');

      // Update application in Elasticsearch using proper cohortId
      await this.updateApplicationData(
        userId,
        submissionData.cohortId, // Use proper cohortId instead of formId
        {
          formstatus: submissionData.formstatus,
          completionPercentage: submissionData.completionPercentage,
          formData: submissionData.formData,
          progress: submissionData.progress,
        }
      );

      LoggerUtil.debug(`Successfully synced form submission data for user: ${userId}, form: ${submissionData.formId}, cohort: ${submissionData.cohortId}`, 'ElasticsearchSyncService');
    } catch (error) {
      LoggerUtil.error('Failed to sync form submission data to Elasticsearch', error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
      // Don't throw error to prevent affecting main flow
    }
  }

  /**
   * Build user profile from database data
   * 
   * @param userId - User ID
   * @param customFieldsProvider - Function to get custom fields
   * @returns Promise<IProfile>
   */
  /**
   * Build user profile by fetching actual user data from database
   * 
   * @param userId - User ID to fetch profile for
   * @param customFieldsProvider - Function to get custom fields
   * @returns Promise<IProfile> - Complete user profile
   */
  private async buildUserProfile(
    userId: string,
    customFieldsProvider?: (userId: string) => Promise<any[]>
  ): Promise<IProfile> {
    try {
      // Fetch user data from database using the injected repository
      const user = await this.userRepository.findOne({ where: { userId } });

      if (!user) {
        LoggerUtil.warn(`User not found in database: ${userId}`, 'ElasticsearchSyncService');
        // Return empty profile if user not found
        return {
          userId,
          username: '',
          firstName: '',
          lastName: '',
          middleName: '',
          email: '',
          mobile: '',
          mobile_country_code: '',
          gender: '',
          dob: '',
          country: '',
          address: '',
          district: '',
          state: '',
          pincode: '',
          status: 'inactive',
          customFields: {},
        };
      }

      // Get custom fields if provider is available
      const allCustomFields = customFieldsProvider 
        ? await customFieldsProvider(userId)
        : [];

      // Filter custom fields to only include profile fields (USER context)
      const profileCustomFields = await this.filterProfileCustomFields(userId, allCustomFields);

      // Format date of birth properly
      let formattedDob: string | null = null;
      if (user.dob instanceof Date) {
        formattedDob = user.dob.toISOString();
      } else if (typeof user.dob === 'string') {
        formattedDob = user.dob;
      }

      // Build profile with actual user data
      return {
        userId: user.userId,
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        middleName: user.middleName || '',
        email: user.email || '',
        mobile: user.mobile?.toString() || '',
        mobile_country_code: user.mobile_country_code || '',
        gender: user.gender || '',
        dob: formattedDob || '',
        country: user.country || '',
        address: user.address || '',
        district: user.district || '',
        state: user.state || '',
        pincode: user.pincode || '',
        status: user.status || 'active',
        customFields: this.processCustomFieldsForElasticsearch(profileCustomFields),
      };
    } catch (error) {
      LoggerUtil.error(`Failed to build user profile for: ${userId}`, error, 'ElasticsearchSyncService', userId);
      // Return empty profile on error
      return {
        userId,
        username: '',
        firstName: '',
        lastName: '',
        middleName: '',
        email: '',
        mobile: '',
        mobile_country_code: '',
        gender: '',
        dob: '',
        country: '',
        address: '',
        district: '',
        state: '',
        pincode: '',
        status: 'inactive',
        customFields: {},
      };
    }
  }

  /**
   * Build complete user document for Elasticsearch
   * 
   * @param userId - User ID
   * @param customFieldsProvider - Function to get custom fields
   * @param applicationDataProvider - Function to get application data
   * @returns Promise<IUser | null>
   */
  private async buildCompleteUserDocument(
    userId: string,
    customFieldsProvider?: (userId: string) => Promise<any[]>,
    applicationDataProvider?: (userId: string) => Promise<IApplication[]>
  ): Promise<IUser | null> {
    try {
      const profile = await this.buildUserProfile(userId, customFieldsProvider);
      const applications = applicationDataProvider 
        ? await applicationDataProvider(userId)
        : [];

      return {
        userId,
        profile,
        applications,
        courses: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      LoggerUtil.error(`Failed to build complete user document for: ${userId}`, error, 'ElasticsearchSyncService', userId);
      return null;
    }
  }

  /**
   * Build Painless script for application updates
   * 
   * @param cohortId - Cohort ID
   * @param updateData - Data to update
   * @returns Script object for Elasticsearch
   */
  private buildApplicationUpdateScript(
    cohortId: string,
    updateData: {
      cohortmemberstatus?: string;
      statusReason?: string;
      completionPercentage?: number;
      formstatus?: string;
      formData?: any;
      progress?: any;
    }
  ) {
    return {
      source: `
        // Initialize applications array if it doesn't exist
        if (ctx._source.applications == null) {
          ctx._source.applications = [];
        }
        
        boolean found = false;
        // Search for existing application with matching cohortId
        for (int i = 0; i < ctx._source.applications.length; i++) {
          if (ctx._source.applications[i].cohortId == params.cohortId) {
            // Update specific fields that are provided in updateData
            if (params.updateData.cohortmemberstatus != null) {
              ctx._source.applications[i].cohortmemberstatus = params.updateData.cohortmemberstatus;
            }
            if (params.updateData.statusReason != null) {
              ctx._source.applications[i].statusReason = params.updateData.statusReason;
            }
            if (params.updateData.completionPercentage != null) {
              ctx._source.applications[i].completionPercentage = params.updateData.completionPercentage;
            }
            if (params.updateData.formstatus != null) {
              ctx._source.applications[i].formstatus = params.updateData.formstatus;
            }
            if (params.updateData.formData != null) {
              ctx._source.applications[i].formData = params.updateData.formData;
            }
            if (params.updateData.progress != null) {
              ctx._source.applications[i].progress = params.updateData.progress;
            }
            
            found = true;
            break;
          }
        }
        
        if (!found) {
          // Create new application if it doesn't exist
          Map newApplication = new HashMap();
          newApplication.cohortId = params.cohortId;
          newApplication.cohortmemberstatus = params.updateData.cohortmemberstatus;
          newApplication.statusReason = params.updateData.statusReason;
          newApplication.formstatus = params.updateData.formstatus;
          newApplication.completionPercentage = params.updateData.completionPercentage;
          newApplication.formData = params.updateData.formData;
          newApplication.progress = params.updateData.progress;
          newApplication.updatedAt = params.updateData.updatedAt;
          newApplication.createdAt = params.updateData.updatedAt;
          
          ctx._source.applications.add(newApplication);
        }
        
        // Update the document's updatedAt timestamp
        ctx._source.updatedAt = params.updateData.updatedAt;
      `,
      lang: 'painless',
      params: {
        cohortId,
        updateData: {
          ...updateData,
          updatedAt: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * Process custom fields for Elasticsearch storage
   * 
   * @param customFields - Raw custom fields data
   * @returns Processed custom fields for Elasticsearch
   */
  private processCustomFieldsForElasticsearch(customFields: any[]): Record<string, any> {
    const processedFields: Record<string, any> = {};

    for (const field of customFields) {
      if (field.fieldId && field.value !== undefined) {
        processedFields[field.fieldId] = {
          fieldId: field.fieldId,
          fieldValuesId: field.fieldValuesId,
          fieldname: field.fieldname,
          code: field.code,
          label: field.label,
          type: field.type,
          value: this.processFieldValueForElasticsearch(field.value),
          context: field.context,
          contextType: field.contextType,
          state: field.state,
          fieldParams: field.fieldParams || {},
        };
      }
    }

    return processedFields;
  }

  /**
   * Process field value for Elasticsearch storage
   * 
   * @param value - Raw field value
   * @returns Processed field value
   */
  private processFieldValueForElasticsearch(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Filter custom fields to include only profile fields (USER context)
   * 
   * @param customFields - All custom fields
   * @param formFieldIds - Form field IDs to exclude (optional)
   * @returns Filtered custom fields (only profile fields)
   */
  filterCustomFields(customFields: any[], formFieldIds: string[] = []): any[] {
    // First filter by context - only include USER/USERS context fields
    const profileFields = customFields.filter(field => {
      return field.context === 'USER' || field.context === 'USERS';
    });

    // Then filter out fields used in forms (if formFieldIds provided)
    if (formFieldIds && formFieldIds.length > 0) {
      const formFieldIdsSet = new Set(formFieldIds);
      return profileFields.filter(field => !formFieldIdsSet.has(field.fieldId));
    }

    return profileFields;
  }

  /**
   * Filter custom fields to only include profile fields (USER context)
   * This method fetches field context information and filters accordingly
   * 
   * @param userId - User ID
   * @param customFields - All custom fields for the user
   * @returns Filtered custom fields (only profile fields)
   */
  private async filterProfileCustomFields(userId: string, customFields: any[]): Promise<any[]> {
    if (!customFields || customFields.length === 0) {
      return [];
    }

    try {
      // Get field IDs from custom fields
      const fieldIds = customFields.map(field => field.fieldId);

      // Fetch field context information from database
      const fieldContexts = await this.userRepository.manager
        .getRepository('Fields')
        .createQueryBuilder('f')
        .select(['f.fieldId', 'f.context', 'f.contextType'])
        .where('f.fieldId IN (:...fieldIds)', { fieldIds })
        .getMany();

      // Create a map of fieldId to context
      const fieldContextMap = new Map();
      fieldContexts.forEach(field => {
        fieldContextMap.set(field.fieldId, field.context);
      });

      // Filter custom fields to only include profile fields (USER context)
      const profileFields = customFields.filter(field => {
        const context = fieldContextMap.get(field.fieldId);
        const isProfileField = context === 'USER' || context === 'USERS';
        
        if (!isProfileField) {
          LoggerUtil.debug(`Excluding field ${field.fieldId} (${field.label}) with context: ${context} for user: ${userId}`, 'ElasticsearchSyncService');
        }
        
        return isProfileField;
      });

      LoggerUtil.debug(`Filtered ${customFields.length} total fields to ${profileFields.length} profile fields for user: ${userId}`, 'ElasticsearchSyncService');
      
      return profileFields;
    } catch (error) {
      LoggerUtil.error(`Failed to filter profile custom fields for user: ${userId}`, error, 'ElasticsearchSyncService', userId);
      // Return empty array on error to avoid breaking the sync
      return [];
    }
  }

  /**
   * Get user document from Elasticsearch
   * 
   * @param userId - User ID
   * @returns Promise<IUser | null>
   */
  /**
   * Get user document from Elasticsearch
   * 
   * @param userId - User ID to retrieve
   * @returns Promise resolving to user document or null if not found
   */
  async getUserDocument(userId: string): Promise<IUser | null> {
    if (!isElasticsearchEnabled()) {
      LoggerUtil.debug(`Elasticsearch disabled, skipping get user document for: ${userId}`, 'ElasticsearchSyncService');
      return null;
    }

    try {
      LoggerUtil.debug(`Getting user document for: ${userId}`, 'ElasticsearchSyncService');
      const result = await this.userElasticsearchService.getUser(userId);
      
      // Convert Elasticsearch result to IUser format
      return result?._source as IUser ?? null;
    } catch (error) {
      LoggerUtil.error('Failed to get user document from Elasticsearch', error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
      return null;
    }
  }

  /**
   * Delete user document from Elasticsearch
   * 
   * @param userId - User ID
   * @returns Promise<void>
   */
  async deleteUserDocument(userId: string): Promise<void> {
    if (!isElasticsearchEnabled()) {
      return;
    }

    try {
      await this.userElasticsearchService.deleteUser(userId);
      LoggerUtil.debug(`Successfully deleted user document: ${userId}`, 'ElasticsearchSyncService');
    } catch (error) {
      LoggerUtil.error('Failed to delete user document from Elasticsearch', error?.message || 'Unknown error', 'ElasticsearchSyncService', userId);
    }
  }

  /**
   * Search users in Elasticsearch
   * 
   * @param query - Search query
   * @returns Promise<Search results>
   */
  async searchUsers(query: string): Promise<any> {
    if (!isElasticsearchEnabled()) {
      return { hits: { hits: [], total: { value: 0 } } };
    }

    try {
      return await this.userElasticsearchService.searchUsers(query);
    } catch (error) {
      LoggerUtil.error('Failed to search users in Elasticsearch', error, 'ElasticsearchSyncService');
      return { hits: { hits: [], total: { value: 0 } } };
    }
  }
} 