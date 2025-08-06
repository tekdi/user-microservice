import { Injectable, Logger } from '@nestjs/common';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { ElasticsearchDataFetcherService } from './elasticsearch-data-fetcher.service';

export enum SyncSection {
  PROFILE = 'profile',
  APPLICATIONS = 'applications',
  COURSES = 'courses',
  ASSESSMENT = 'assessment',
  ALL = 'all'
}

export interface SyncOptions {
  section: SyncSection;
  forceFullSync?: boolean;
  skipExternalServices?: boolean;
}

@Injectable()
export class ElasticsearchSyncService {
  private readonly logger = new Logger(ElasticsearchSyncService.name);

  constructor(
    private readonly userElasticsearchService: UserElasticsearchService,
    private readonly elasticsearchDataFetcherService: ElasticsearchDataFetcherService,
  ) {}

  /**
   * Centralized function to sync user data to Elasticsearch
   * 
   * @param userId - User ID to sync
   * @param options - Sync options including which section to update
   * @returns Promise<void>
   */
  async syncUserToElasticsearch(userId: string, options: SyncOptions = { section: SyncSection.ALL }): Promise<void> {
    try {
      this.logger.log(`Starting centralized sync for userId: ${userId}, section: ${options.section}`);

      // Check if user exists in Elasticsearch
      const existingUser = await this.userElasticsearchService.getUser(userId);
      
      if (existingUser) {
        this.logger.log(`User ${userId} exists in Elasticsearch, updating specific section: ${options.section}`);
        await this.updateExistingUser(userId, options);
      } else {
        this.logger.log(`User ${userId} does not exist in Elasticsearch, creating full document`);
        await this.createNewUser(userId, options);
      }

      this.logger.log(`Centralized sync completed for userId: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to sync user ${userId} to Elasticsearch:`, error);
      throw error;
    }
  }

  /**
   * Update existing user document in Elasticsearch
   */
  private async updateExistingUser(userId: string, options: SyncOptions): Promise<void> {
    try {
      // Get current document from Elasticsearch
      const currentDoc = await this.userElasticsearchService.getUser(userId);
      if (!currentDoc) {
        throw new Error(`User ${userId} not found in Elasticsearch during update`);
      }

      const currentData = currentDoc._source;
      let updatedData: any = {};

      // Update specific section based on service calling
      switch (options.section) {
        case SyncSection.PROFILE:
          updatedData = await this.updateProfileSection(userId, currentData);
          break;
        
        case SyncSection.APPLICATIONS:
          updatedData = await this.updateApplicationsSection(userId, currentData);
          break;
        
        case SyncSection.COURSES:
          updatedData = await this.updateCoursesSection(userId, currentData);
          break;
        
        case SyncSection.ASSESSMENT:
          updatedData = await this.updateAssessmentSection(userId, currentData);
          break;
        
        case SyncSection.ALL:
        default:
          updatedData = await this.updateAllSections(userId, currentData, options);
          break;
      }

      // Update the document in Elasticsearch
      await this.userElasticsearchService.updateUser(
        userId,
        { doc: updatedData },
        async (userId: string) => {
          return await this.elasticsearchDataFetcherService.comprehensiveUserSync(userId);
        }
      );

      this.logger.log(`Updated user ${userId} in Elasticsearch for section: ${options.section}`);
    } catch (error) {
      this.logger.error(`Failed to update existing user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create new user document in Elasticsearch
   */
  private async createNewUser(userId: string, options: SyncOptions): Promise<void> {
    try {
      // Fetch complete user data from all services
      const completeUserData = await this.elasticsearchDataFetcherService.comprehensiveUserSync(userId);
      
      if (!completeUserData) {
        throw new Error(`Failed to fetch complete user data for ${userId}`);
      }

      // Create new document in Elasticsearch
      await this.userElasticsearchService.createUser(completeUserData);
      
      this.logger.log(`Created new user document for ${userId} in Elasticsearch`);
    } catch (error) {
      this.logger.error(`Failed to create new user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Modular subfunction: Get user profile from database
   */
  private async getUserProfileFromDB(userId: string): Promise<any> {
    try {
      this.logger.log(`Fetching user profile from DB for userId: ${userId}`);
      
      const user = await this.elasticsearchDataFetcherService['userRepository'].findOne({ 
        where: { userId } 
      });
      
      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      const profile = await this.elasticsearchDataFetcherService['fetchUserProfile'](user);
      this.logger.log(`Successfully fetched user profile for userId: ${userId}`);
      
      return profile;
    } catch (error) {
      this.logger.error(`Failed to get user profile from DB for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Modular subfunction: Get user applications from database
   */
  private async getUserApplicationsFromDB(userId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching user applications from DB for userId: ${userId}`);
      
      const applications = await this.elasticsearchDataFetcherService.fetchUserApplications(userId);
      this.logger.log(`Successfully fetched ${applications.length} applications for userId: ${userId}`);
      
      return applications;
    } catch (error) {
      this.logger.error(`Failed to get user applications from DB for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Modular subfunction: Get user courses from LMS service
   */
  private async getUserCoursesFromLMS(userId: string, tenantId: string, organisationId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching user courses from LMS for userId: ${userId}`);
      
      const lmsData = await this.elasticsearchDataFetcherService['fetchLessonModuleDataFromLMS'](
        userId, tenantId, organisationId
      );
      
      this.logger.log(`Successfully fetched LMS data for userId: ${userId}`);
      return lmsData;
    } catch (error) {
      this.logger.error(`Failed to get user courses from LMS for userId: ${userId}:`, error);
      throw error;
    }
  }


  /**
   * Modular subfunction: Get user answers from Assessment service
   */
  private async getUserAnswersFromAssessment(userId: string, tenantId: string, organisationId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching user answers from Assessment for userId: ${userId}`);
      
      const assessmentData = await this.elasticsearchDataFetcherService['fetchQuestionAnswerDataFromAssessment'](
        userId, tenantId, organisationId
      );
      
      this.logger.log(`Successfully fetched assessment data for userId: ${userId}`);
      return assessmentData;
    } catch (error) {
      this.logger.error(`Failed to get user answers from Assessment for userId: ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update profile section only
   */
  private async updateProfileSection(userId: string, currentData: any): Promise<any> {
    this.logger.log(`Updating profile section for userId: ${userId}`);
    
    // Use modular subfunction to get profile data
    const profile = await this.getUserProfileFromDB(userId);
    
    // Use deep merge to preserve existing structure
    return this.deepMerge(currentData, { profile });
  }

  /**
   * Update applications section only
   */
  private async updateApplicationsSection(userId: string, currentData: any): Promise<any> {
    this.logger.log(`Updating applications section for userId: ${userId}`);
    
    // Use modular subfunction to get applications data
    const applications = await this.getUserApplicationsFromDB(userId);
    
    // Use deep merge to preserve existing structure
    return this.deepMerge(currentData, { applications });
  }

  /**
   * Update courses section only
   */
  private async updateCoursesSection(userId: string, currentData: any): Promise<any> {
    this.logger.log(`Updating courses section for userId: ${userId}`);
    
    // Get user's tenant and organisation data
    let tenantId = 'default-tenant';
    let organisationId = 'default-organisation';
    
    try {
      const userTenantMapping = await this.elasticsearchDataFetcherService['cohortMembersRepository'].manager
        .getRepository('UserTenantMapping')
        .findOne({ where: { userId } });
      
      if (userTenantMapping) {
        tenantId = userTenantMapping.tenantId || 'default-tenant';
        organisationId = userTenantMapping.organisationId || 'default-organisation';
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch tenant data for userId: ${userId}, using default values`);
    }

    // Use modular subfunction to get courses data
    const lmsData = await this.getUserCoursesFromLMS(userId, tenantId, organisationId);

    // Update applications with new courses data
    const updatedApplications = currentData.applications || [];
    this.elasticsearchDataFetcherService['enhanceCourseDataWithAssessmentData'](updatedApplications, []);

    // Use deep merge to preserve existing structure
    return this.deepMerge(currentData, { applications: updatedApplications });
  }

  
  /**
   * Update assessment section only
   */
  private async updateAssessmentSection(userId: string, currentData: any): Promise<any> {
    this.logger.log(`Updating assessment section for userId: ${userId}`);
    
    // Get user's tenant and organisation data
    let tenantId = 'default-tenant';
    let organisationId = 'default-organisation';
    
    try {
      const userTenantMapping = await this.elasticsearchDataFetcherService['cohortMembersRepository'].manager
        .getRepository('UserTenantMapping')
        .findOne({ where: { userId } });
      
      if (userTenantMapping) {
        tenantId = userTenantMapping.tenantId || 'default-tenant';
        organisationId = userTenantMapping.organisationId || 'default-organisation';
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch tenant data for userId: ${userId}, using default values`);
    }

    // Use modular subfunction to get assessment data
    const assessmentData = await this.getUserAnswersFromAssessment(userId, tenantId, organisationId);

    // Update applications with new assessment data
    const updatedApplications = currentData.applications || [];
    this.elasticsearchDataFetcherService['enhanceCourseDataWithAssessmentData'](updatedApplications, assessmentData);

    // Use deep merge to preserve existing structure
    return this.deepMerge(currentData, { applications: updatedApplications });
  }

  /**
   * Update all sections (comprehensive sync)
   */
  private async updateAllSections(userId: string, currentData: any, options: SyncOptions): Promise<any> {
    this.logger.log(`Updating all sections for userId: ${userId}`);
    
    // Fetch complete user data
    const completeUserData = await this.elasticsearchDataFetcherService.comprehensiveUserSync(userId);
    
    if (!completeUserData) {
      throw new Error(`Failed to fetch complete user data for ${userId}`);
    }

    return completeUserData;
  }

  /**
   * Improved deep merge function for nested structures
   * Handles arrays, objects, and primitive values
   */
  private deepMerge(existing: any, updates: any): any {
    if (!existing) return updates;
    if (!updates) return existing;

    // Handle arrays
    if (Array.isArray(existing) && Array.isArray(updates)) {
      return updates; // Replace arrays completely
    }

    // Handle objects
    if (typeof existing === 'object' && typeof updates === 'object' && !Array.isArray(existing) && !Array.isArray(updates)) {
      const merged = { ...existing };
      
      for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
          if (existing.hasOwnProperty(key) && 
              typeof existing[key] === 'object' && 
              typeof updates[key] === 'object' && 
              !Array.isArray(existing[key]) && 
              !Array.isArray(updates[key])) {
            // Recursively merge nested objects
            merged[key] = this.deepMerge(existing[key], updates[key]);
          } else {
            // Replace or add new values
            merged[key] = updates[key];
          }
        }
      }
      
      return merged;
    }

    // Handle primitives - updates take precedence
    return updates;
  }

  /**
   * Check if specific section exists in current document
   */
  private hasSection(currentData: any, section: SyncSection): boolean {
    switch (section) {
      case SyncSection.PROFILE:
        return !!currentData.profile;
      case SyncSection.APPLICATIONS:
        return !!(currentData.applications && currentData.applications.length > 0);
      case SyncSection.COURSES:
        return !!(currentData.applications && 
          currentData.applications.some((app: any) => 
            app.courses && app.courses.values && app.courses.values.length > 0
          ));
      case SyncSection.ASSESSMENT:
        return !!(currentData.applications && 
          currentData.applications.some((app: any) => 
            app.courses && app.courses.values && 
            app.courses.values.some((course: any) => 
              course.units && course.units.values && 
              course.units.values.some((unit: any) => 
                unit.contents && unit.contents.values && 
                unit.contents.values.some((content: any) => 
                  content.tracking && content.tracking.answers
                )
              )
            )
          ));
      default:
        return true;
    }
  }

  /**
   * Get missing sections that need to be fetched
   */
  private getMissingSections(currentData: any): SyncSection[] {
    const missingSections: SyncSection[] = [];
    
    if (!this.hasSection(currentData, SyncSection.PROFILE)) {
      missingSections.push(SyncSection.PROFILE);
    }
    
    if (!this.hasSection(currentData, SyncSection.APPLICATIONS)) {
      missingSections.push(SyncSection.APPLICATIONS);
    }
    
    if (!this.hasSection(currentData, SyncSection.COURSES)) {
      missingSections.push(SyncSection.COURSES);
    }
    
    if (!this.hasSection(currentData, SyncSection.ASSESSMENT)) {
      missingSections.push(SyncSection.ASSESSMENT);
    }
    
    return missingSections;
  }
} 