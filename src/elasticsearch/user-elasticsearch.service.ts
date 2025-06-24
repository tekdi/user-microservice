import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { IUser, IApplication, ICourse } from './interfaces/user.interface';
@Injectable()
export class UserElasticsearchService {
  private readonly indexName = 'users';
  private readonly logger = new Logger(UserElasticsearchService.name);
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.elasticsearchService.ping();
      return true;
    } catch (error) {
      this.logger.error('Elasticsearch is not available:', error);
      return false;
    }
  }

  async deleteIndex() {
    try {
      const exists = await this.elasticsearchService.indexExists(
        this.indexName
      );
      if (exists) {
        await this.elasticsearchService.deleteIndex(this.indexName);
        this.logger.log(`Index ${this.indexName} deleted successfully`);
      }
    } catch (error) {
      console.error(`Failed to delete index ${this.indexName}:`, error);
      throw error;
    }
  }

  async initialize() {
    try {
      // Delete existing index if it exists
      // await this.deleteIndex();

      const mapping = {
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            profile: {
              properties: {
                userId: { type: 'keyword' },
                username: { type: 'keyword' },
                firstName: { type: 'text' },
                lastName: { type: 'text' },
                middleName: { type: 'text' },
                email: { type: 'keyword' },
                mobile: { type: 'keyword' },
                mobile_country_code: { type: 'keyword' },
                gender: { type: 'keyword' },
                dob: { type: 'date', null_value: null },
                address: { type: 'text' },
                state: { type: 'keyword' },
                district: { type: 'keyword' },
                country: { type: 'keyword' },
                pincode: { type: 'keyword' },
                status: { type: 'keyword' },
                customFields: {
                  type: 'nested',
                  properties: {
                    fieldId: { type: 'keyword' },
                    value: { type: 'text' },
                  },
                },
              },
            },
            applications: {
              type: 'nested',
              properties: {
                cohortId: { type: 'keyword' },
                status: { type: 'keyword' },
                cohortmemberstatus: { type: 'keyword' },
                formstatus: { type: 'keyword' },
                progress: {
                  properties: {
                    pages: {
                      type: 'object',
                      properties: {
                        completed: { type: 'boolean' },
                        fields: { type: 'object', dynamic: true },
                      },
                    },
                    overall: {
                      properties: {
                        completed: { type: 'integer' },
                        total: { type: 'integer' },
                      },
                    },
                  },
                },
                lastSavedAt: { type: 'date', null_value: null },
                submittedAt: { type: 'date', null_value: null },
                cohortDetails: {
                  properties: {
                    name: { type: 'text' },
                    description: { type: 'text' },
                    startDate: { type: 'date', null_value: null },
                    endDate: { type: 'date', null_value: null },
                    status: { type: 'keyword' },
                  },
                },
              },
            },
            courses: {
              type: 'nested',
              properties: {
                courseId: { type: 'keyword' },
                progress: { type: 'float' },
                lessonsCompleted: { type: 'keyword' },
                lastLessonAt: { type: 'date', null_value: null },
                courseDetails: {
                  properties: {
                    name: { type: 'text' },
                    description: { type: 'text' },
                    duration: { type: 'integer' },
                    status: { type: 'keyword' },
                  },
                },
              },
            },
            createdAt: { type: 'date', null_value: null },
            updatedAt: { type: 'date', null_value: null },
          },
        },
      };

      await this.elasticsearchService.createIndex(this.indexName, mapping);
      console.log(`Index ${this.indexName} created successfully with mappings`);
    } catch (error) {
      console.error('Failed to initialize Elasticsearch index:', error);
      throw new Error(
        `Failed to initialize Elasticsearch index: ${error.message}`
      );
    }
  }

  async createUser(user: IUser) {
    try {
      // Handle empty date values
      if (user.profile.dob === '') {
        user.profile.dob = undefined;
      }
      if (user.createdAt === '') {
        user.createdAt = new Date().toISOString();
      }
      if (user.updatedAt === '') {
        user.updatedAt = new Date().toISOString();
      }

      // Ensure all required fields are present
      const elasticUser: IUser = {
        userId: user.userId,
        profile: {
          userId: user.profile.userId,
          username: user.profile.username,
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          middleName: user.profile.middleName,
          email: user.profile.email,
          mobile: user.profile.mobile,
          mobile_country_code: user.profile.mobile_country_code,
          dob: user.profile.dob,
          gender: user.profile.gender,
          address: user.profile.address,
          district: user.profile.district,
          state: user.profile.state,
          pincode: user.profile.pincode,
          status: user.profile.status,
          customFields: user.profile.customFields || {},
        },
        applications: user.applications || [],
        courses: user.courses || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      const result = await this.elasticsearchService.index(
        this.indexName,
        user.userId,
        elasticUser
      );
      return result;
    } catch (error) {
      console.error('Failed to create user in Elasticsearch:', error);
      throw new Error(
        `Failed to create user in Elasticsearch: ${error.message}`
      );
    }
  }

  async updateUser(userId: string, updateData: any): Promise<any> {
    try {
      const result = await this.elasticsearchService.update(
        this.indexName,
        userId,
        updateData,
        { retry_on_conflict: 3 }
      );
      return result;
    } catch (error) {
      console.error('Error updating user in Elasticsearch:', error);
      throw new Error(
        `Failed to update user in Elasticsearch: ${error.message}`
      );
    }
  }

  async deleteUser(userId: string) {
    try {
      const result = await this.elasticsearchService.delete(
        this.indexName,
        userId
      );
      return result;
    } catch (error) {
      console.error('Failed to delete user from Elasticsearch:', error);
      throw new Error(
        `Failed to delete user from Elasticsearch: ${error.message}`
      );
    }
  }

  async getUser(userId: string) {
    try {
      const result = await this.elasticsearchService.get(
        this.indexName,
        userId
      );
      return result;
    } catch (error) {
      if (error.meta?.statusCode === 404) {
        return null;
      }
      console.error('Failed to get user from Elasticsearch:', error);
      throw new Error(
        `Failed to get user from Elasticsearch: ${error.message}`
      );
    }
  }

  async searchUsers(query: any) {
    const logger = new Logger('UserElasticsearchService');

    try {
      if (!query) {
        throw new Error('Search query is required');
      }

      const searchQuery = {
        bool: {
          must: [],
          filter: [],
        },
      };

      // Add text search
      if (query.q) {
        if (typeof query.q !== 'string') {
          throw new Error('Search query must be a string');
        }

        searchQuery.bool.must.push({
          multi_match: {
            query: query.q,
            fields: [
              'profile.firstName^2',
              'profile.lastName^2',
              'profile.email',
              'profile.username',
            ],
            fuzziness: 'AUTO',
          },
        });
      }

      // Filters
      if (query.filters && typeof query.filters === 'object') {
        Object.entries(query.filters).forEach(([field, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            if (field.includes('.')) {
              const [nestedPath, nestedField] = field.split('.');
              searchQuery.bool.filter.push({
                nested: {
                  path: nestedPath,
                  query: {
                    term: { [`${nestedPath}.${nestedField}`]: value },
                  },
                },
              });
            } else {
              searchQuery.bool.filter.push({
                term: { [`profile.${field}`]: value },
              });
            }
          }
        });
      }

      // Removed: tenantCohortRoleMapping nested filter — not mapped
      // if (query.tenantId) ...

      // cohortId (still valid)
      if (query.cohortId && typeof query.cohortId === 'string') {
        searchQuery.bool.filter.push({
          nested: {
            path: 'applications',
            query: {
              term: { 'applications.cohortId': query.cohortId },
            },
          },
        });
      }

      // Pagination safety
      const size = Math.min(query.size ?? 10, 10000); // ES max size
      const from = query.from ?? 0;

      // Logging (safe)
      logger.debug(`Elasticsearch query: ${JSON.stringify(searchQuery)}`);

      const result = await this.elasticsearchService.search(
        this.indexName,
        searchQuery,
        {
          size,
          from,
          sort: query.sort ?? [{ updatedAt: 'desc' }],
          _source: {
            includes: [
              'userId',
              'profile.*',
              'applications.*',
              'courses.*',
              'createdAt',
              'updatedAt',
            ],
          },
        }
      );

      return result;
    } catch (error) {
      const message = `Failed to search users in Elasticsearch: ${error.message}`;
      logger.error(message, error.stack);
      throw new Error(message);
    }
  }

  private async exists(userId: string): Promise<boolean> {
    try {
      const result = await this.elasticsearchService.search(this.indexName, {
        term: { userId },
      });
      return result.hits.length > 0;
    } catch (error) {
      this.logger.warn(`Error checking user existence for ${userId}:`, error);
      return false;
    }
  }

  async updateApplication(
    userId: string,
    application: IApplication
  ): Promise<void> {
    try {
      const exists = await this.exists(userId);
      let existingCohortMemberStatus;
      if (exists) {
        // Fetch the existing application for this cohortId
        const userDoc = await this.elasticsearchService.get(
          this.indexName,
          userId
        );
        const source =
          userDoc && (userDoc._source as { applications?: IApplication[] });
        if (source && Array.isArray(source.applications)) {
          const existingApp = source.applications.find(
            (app) => app.cohortId === application.cohortId
          );
          if (existingApp && existingApp.cohortmemberstatus !== undefined) {
            existingCohortMemberStatus = existingApp.cohortmemberstatus;
          }
        }
      }

      // Map form fields to pages structure
      const mappedApplication: IApplication = {
        cohortId: application.cohortId,
        formId: application.formId,
        submissionId: application.submissionId,
        // Only set cohortmemberstatus if provided, otherwise preserve existing
        cohortmemberstatus:
          application.cohortmemberstatus !== undefined
            ? application.cohortmemberstatus
            : existingCohortMemberStatus,
        formstatus: application.formstatus || 'inactive',
        progress: {
          pages: {},
          overall: {
            completed: 0,
            total: 0,
          },
        },
        lastSavedAt: application.lastSavedAt || new Date().toISOString(),
        submittedAt: application.submittedAt || new Date().toISOString(),
        cohortDetails: application.cohortDetails || {
          name: '',
          status: 'active',
        },
        formData: {},
      };

      // If application has formData, map it to pages structure
      if (application.formData) {
        const pages = {};
        let completedCount = 0;
        let totalCount = 0;

        // Map form data to the correct schema structure
        Object.entries(application.formData).forEach(([pageId, pageData]) => {
          const fields = {};
          let pageCompleted = true;

          Object.entries(pageData).forEach(([fieldId, value]) => {
            if (value !== null && value !== undefined && value !== '') {
              // Use fieldId directly without schema or name
              fields[fieldId] = value;
              completedCount++;
            } else {
              pageCompleted = false;
            }
            totalCount++;
          });

          // Map page names
          const pageName = pageId === 'default' ? 'eligibility' : pageId;
          pages[pageName] = {
            completed: pageCompleted,
            fields,
          };
        });

        mappedApplication.progress = {
          pages,
          overall: {
            completed: completedCount,
            total: totalCount,
          },
        };

        // Also update formData with the same structure
        mappedApplication.formData = application.formData;
      }

      // Update existing document with new application
      const script = {
        source: `
          if (ctx._source.applications == null) {
            ctx._source.applications = [];
          }
          
          boolean found = false;
          for (int i = 0; i < ctx._source.applications.length; i++) {
            if (ctx._source.applications[i].cohortId == params.application.cohortId) {
              // Update existing application
              ctx._source.applications[i] = params.application;
              found = true;
              break;
            }
          }
          
          if (!found) {
            // Add new application
            ctx._source.applications.add(params.application);
          }
          
          // Update the document's updatedAt timestamp
          ctx._source.updatedAt = params.updatedAt;
        `,
        lang: 'painless',
        params: {
          application: mappedApplication,
          updatedAt: new Date().toISOString(),
        },
      };

      await this.elasticsearchService.update(this.indexName, userId, {
        script,
      });
    } catch (error) {
      console.error('Failed to update application in Elasticsearch:', error);
      throw error;
    }
  }

  private getPageName(pageId: string): string {
    // Map page IDs to their corresponding names
    const pageMap = {
      '0': 'eligibility',
      '1': 'personalDetails',
      '2': 'background',
      '3': 'education',
      '4': 'additional',
    };
    return pageMap[pageId] ?? pageId;
  }

  async updateCourse(
    userId: string,
    courseId: string,
    course: Partial<ICourse>
  ): Promise<any> {
    try {
      const script = {
        source: `
          if (ctx._source.courses == null) {
            ctx._source.courses = [];
          }
          boolean found = false;
          for (int i = 0; i < ctx._source.courses.length; i++) {
            if (ctx._source.courses[i].courseId == params.courseId) {
              ctx._source.courses[i] = params.course;
              found = true;
              break;
            }
          }
          if (!found) {
            ctx._source.courses.add(params.course);
          }
        `,
        lang: 'painless',
        params: {
          courseId,
          course,
        },
      };

      const result = await this.elasticsearchService.update(
        this.indexName,
        userId,
        { script },
        { retry_on_conflict: 3 }
      );
      return result;
    } catch (error) {
      console.error('Error updating course in Elasticsearch:', error);
      throw new Error(
        `Failed to update course in Elasticsearch: ${error.message}`
      );
    }
  }

  async updateApplicationPage(
    userId: string,
    cohortId: string,
    pageId: string,
    pageData: { completed: boolean; fields: Record<string, any> }
  ): Promise<any> {
    try {
      // Validate input
      if (!userId || !cohortId || !pageId) {
        throw new Error(
          'Missing required parameters: userId, cohortId, and pageId are required'
        );
      }

      if (
        !pageData ||
        typeof pageData.completed !== 'boolean' ||
        !pageData.fields
      ) {
        throw new Error(
          'Invalid page data: completed status and fields are required'
        );
      }

      // Validate fields object
      if (typeof pageData.fields !== 'object') {
        throw new Error('Invalid fields: must be an object');
      }

      const script = {
        source: `
          if (ctx._source.applications == null) {
            ctx._source.applications = [];
          }
          boolean found = false;
          for (int i = 0; i < ctx._source.applications.length; i++) {
            if (ctx._source.applications[i].cohortId == params.cohortId) {
              if (ctx._source.applications[i].progress == null) {
                ctx._source.applications[i].progress = [:];
              }
              if (ctx._source.applications[i].progress.pages == null) {
                ctx._source.applications[i].progress.pages = [:];
              }
              if (ctx._source.applications[i].formData == null) {
                ctx._source.applications[i].formData = [:];
              }
              ctx._source.applications[i].progress.pages[params.pageId] = params.pageData;
              ctx._source.applications[i].formData[params.pageId] = params.pageData.fields;
              ctx._source.applications[i].lastSavedAt = params.lastSavedAt;
              found = true;
              break;
            }
          }
          if (!found) {
            Map pages = new HashMap();
            pages[params.pageId] = params.pageData;
            Map progress = new HashMap();
            progress.pages = pages;
            Map formData = new HashMap();
            formData[params.pageId] = params.pageData.fields;
            Map application = new HashMap();
            application.cohortId = params.cohortId;
            application.progress = progress;
            application.formData = formData;
            application.lastSavedAt = params.lastSavedAt;
            ctx._source.applications.add(application);
          }
        `,
        lang: 'painless',
        params: {
          cohortId,
          pageId,
          pageData,
          lastSavedAt: new Date().toISOString(),
        },
      };

      const result = await this.elasticsearchService.update(
        this.indexName,
        userId,
        { script },
        { retry_on_conflict: 3 }
      );
      return result;
    } catch (error) {
      console.error('Error updating application page in Elasticsearch:', error);
      throw new Error(
        `Failed to update application page in Elasticsearch: ${error.message}`
      );
    }
  }

  async syncUserToElasticsearch(
    user: IUser,
    applications?: IApplication[],
    courses?: ICourse[]
  ) {
    try {
      // Handle empty date values
      if (user.profile.dob === '') {
        delete user.profile.dob;
      }
      if (user.createdAt === '') {
        user.createdAt = new Date().toISOString();
      }
      if (user.updatedAt === '') {
        user.updatedAt = new Date().toISOString();
      }

      // Ensure all required fields are present
      const elasticUser: IUser = {
        userId: user.userId,
        profile: {
          userId: user.profile.userId,
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          middleName: user.profile.middleName,
          username: user.profile.username,
          email: user.profile.email,
          mobile_country_code: user.profile.mobile_country_code,
          mobile: user.profile.mobile,
          dob: user.profile.dob,
          gender: user.profile.gender,
          address: user.profile.address,
          district: user.profile.district,
          state: user.profile.state,
          pincode: user.profile.pincode,
          status: user.profile.status,
          customFields: user.profile.customFields || {},
        },
        applications: applications || user.applications || [],
        courses: courses || user.courses || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Use update instead of index to ensure we only update after database changes
      const result = await this.elasticsearchService.update(
        this.indexName,
        user.userId,
        elasticUser,
        { retry_on_conflict: 3 }
      );
      return result;
    } catch (error) {
      console.error('Failed to sync user to Elasticsearch:', error);
      throw new Error(`Failed to sync user to Elasticsearch: ${error.message}`);
    }
  }

  async updateUserProfile(userId: string, profile: any): Promise<any> {
    // Only update the profile field in the Elasticsearch document
    return this.updateUser(userId, { doc: { profile } });
  }
}
