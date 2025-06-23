import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { IUser, IApplication, ICourse } from './interfaces/user.interface';

@Injectable()
export class UserElasticsearchService {
  private readonly indexName = 'users';

  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.elasticsearchService.ping();
      return true;
    } catch (error) {
      console.error('Elasticsearch is not available:', error);
      return false;
    }
  }

  async deleteIndex() {
    try {
      const exists = await this.elasticsearchService.indexExists(this.indexName);
      if (exists) {
        await this.elasticsearchService.deleteIndex(this.indexName);
        console.log(`Index ${this.indexName} deleted successfully`);
      }
    } catch (error) {
      console.error(`Failed to delete index ${this.indexName}:`, error);
      throw error;
    }
  }

  async initialize() {
    try {
      // Delete existing index if it exists
      await this.deleteIndex();

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
                    value: { type: 'text' }
                  }
                }
              }
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
                        fields: { type: 'object', dynamic: true }
                      }
                    },
                    overall: {
                      properties: {
                        completed: { type: 'integer' },
                        total: { type: 'integer' }
                      }
                    }
                  }
                },
                lastSavedAt: { type: 'date', null_value: null },
                submittedAt: { type: 'date', null_value: null },
                cohortDetails: {
                  properties: {
                    name: { type: 'text' },
                    description: { type: 'text' },
                    startDate: { type: 'date', null_value: null },
                    endDate: { type: 'date', null_value: null },
                    status: { type: 'keyword' }
                  }
                }
              }
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
                    status: { type: 'keyword' }
                  }
                }
              }
            },
            createdAt: { type: 'date', null_value: null },
            updatedAt: { type: 'date', null_value: null }
          }
        }
      };

      await this.elasticsearchService.createIndex(this.indexName, mapping);
      console.log(`Index ${this.indexName} created successfully with mappings`);
    } catch (error) {
      console.error('Failed to initialize Elasticsearch index:', error);
      throw new Error(`Failed to initialize Elasticsearch index: ${error.message}`);
    }
  }

  async createUser(user: IUser) {
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
          customFields: user.profile.customFields || {}
        },
        applications: user.applications || [],
        courses: user.courses || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      const result = await this.elasticsearchService.index(
        this.indexName,
        user.userId,
        elasticUser
      );
      return result;
    } catch (error) {
      console.error('Failed to create user in Elasticsearch:', error);
      throw new Error(`Failed to create user in Elasticsearch: ${error.message}`);
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
      throw new Error(`Failed to update user in Elasticsearch: ${error.message}`);
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
      throw new Error(`Failed to delete user from Elasticsearch: ${error.message}`);
    }
  }

  async searchUsers(query: any) {
    try {
      if (!query) {
        throw new Error('Search query is required');
      }

      const searchQuery = {
        bool: {
          must: [],
          filter: []
        }
      };

      // Add text search if query.q is provided
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
              'profile.username'
            ],
            fuzziness: 'AUTO'
          }
        });
      }

      // Add filters for any field
      if (query.filters) {
        if (typeof query.filters !== 'object') {
          throw new Error('Filters must be an object');
        }
        Object.entries(query.filters).forEach(([field, value]) => {
          if (value) {
            // Handle nested fields
            if (field.includes('.')) {
              const [nestedPath, nestedField] = field.split('.');
              searchQuery.bool.filter.push({
                nested: {
                  path: nestedPath,
                  query: {
                    term: { [`${nestedPath}.${nestedField}`]: value }
                  }
                }
              });
            } else {
              searchQuery.bool.filter.push({
                term: { [`profile.${field}`]: value }
              });
            }
          }
        });
      }

      // Add tenant and cohort filters
      if (query.tenantId) {
        if (typeof query.tenantId !== 'string') {
          throw new Error('tenantId must be a string');
        }
        searchQuery.bool.filter.push({
          nested: {
            path: 'tenantCohortRoleMapping',
            query: {
              term: { 'tenantCohortRoleMapping.tenantId': query.tenantId }
            }
          }
        });
      }

      if (query.cohortId) {
        if (typeof query.cohortId !== 'string') {
          throw new Error('cohortId must be a string');
        }
        searchQuery.bool.filter.push({
          nested: {
            path: 'applications',
            query: {
              term: { 'applications.cohortId': query.cohortId }
            }
          }
        });
      }

      console.log('Search query:', JSON.stringify(searchQuery, null, 2));

      const result = await this.elasticsearchService.search(
        this.indexName,
        searchQuery,
        {
          size: query.size || 10,
          from: query.from || 0,
          sort: query.sort || [{ updatedAt: 'desc' }],
          _source: {
            includes: [
              'userId',
              'profile.*',
              'applications.*',
              'courses.*',
              'createdAt',
              'updatedAt'
            ]
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Failed to search users in Elasticsearch:', error);
      throw new Error(`Failed to search users in Elasticsearch: ${error.message}`);
    }
  }

  private async exists(userId: string): Promise<boolean> {
    try {
      const result = await this.elasticsearchService.search(this.indexName, {
        term: { userId }
      });
      return result.hits.length > 0;
    } catch (error) {
      return false;
    }
  }

  async updateApplication(userId: string, application: IApplication): Promise<void> {
    try {
      console.log('Original application data:', JSON.stringify(application, null, 2));

      const exists = await this.exists(userId);
      if (!exists) {
        // Create new document with application
        const newDoc: IUser = {
          userId,
          profile: {
            userId,
            username: '',
            firstName: '',
            lastName: '',
            middleName: '',
            email: '',
            mobile: '',
            mobile_country_code: '',
            gender: '',
            dob: null,
            address: '',
            district: '',
            state: '',
            pincode: '',
            status: 'active',
            customFields: []
          },
          applications: [{
            cohortId: application.cohortId,
            status: application.status || 'inactive',
            cohortmemberstatus: application.cohortmemberstatus || 'inactive',
            formstatus: application.formstatus || 'inactive',
            progress: application.progress || {
              pages: {},
              overall: {
                completed: 0,
                total: 0
              }
            },
            lastSavedAt: application.lastSavedAt || new Date().toISOString(),
            submittedAt: application.submittedAt || new Date().toISOString(),
            cohortDetails: application.cohortDetails || {
              name: '',
              status: 'active'
            }
          }],
          courses: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log('Creating new document:', JSON.stringify(newDoc, null, 2));
        await this.elasticsearchService.index(this.indexName, userId, newDoc);
        return;
      }

      // Map form fields to pages structure
      const mappedApplication: IApplication = {
        cohortId: application.cohortId,
        status: application.status || 'inactive',
        cohortmemberstatus: application.cohortmemberstatus || 'inactive',
        formstatus: application.formstatus || 'inactive',
        progress: {
          pages: {},
          overall: {
            completed: 0,
            total: 0
          }
        },
        lastSavedAt: application.lastSavedAt || new Date().toISOString(),
        submittedAt: application.submittedAt || new Date().toISOString(),
        cohortDetails: application.cohortDetails || {
          name: '',
          status: 'active'
        },
        formData: {}
      };

      // If application has formData, map it to pages structure
      if (application.formData) {
        console.log('Form data before mapping:', JSON.stringify(application.formData, null, 2));
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
            fields
          };
        });

        mappedApplication.progress = {
          pages,
          overall: {
            completed: completedCount,
            total: totalCount
          }
        };

        // Also update formData with the same structure
        mappedApplication.formData = application.formData;
        
        console.log('Mapped pages structure:', JSON.stringify(mappedApplication.progress, null, 2));
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
          updatedAt: new Date().toISOString()
        }
      };

      console.log('Final application data being sent to Elasticsearch:', JSON.stringify(script.params.application, null, 2));
      await this.elasticsearchService.update(this.indexName, userId, { script });
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
      '4': 'additional'
    };
    return pageMap[pageId] || pageId;
  }

  async updateCourse(userId: string, courseId: string, course: Partial<ICourse>): Promise<any> {
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
          course
        }
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
      throw new Error(`Failed to update course in Elasticsearch: ${error.message}`);
    }
  }

  async updateApplicationPage(userId: string, cohortId: string, pageId: string, pageData: { completed: boolean; fields: Record<string, any> }): Promise<any> {
    try {
      // Validate input
      if (!userId || !cohortId || !pageId) {
        throw new Error('Missing required parameters: userId, cohortId, and pageId are required');
      }

      if (!pageData || typeof pageData.completed !== 'boolean' || !pageData.fields) {
        throw new Error('Invalid page data: completed status and fields are required');
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
          lastSavedAt: new Date().toISOString()
        }
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
      throw new Error(`Failed to update application page in Elasticsearch: ${error.message}`);
    }
  }

  async syncUserToElasticsearch(user: IUser, applications?: IApplication[], courses?: ICourse[]) {
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
          customFields: user.profile.customFields || {}
        },
        applications: applications || user.applications || [],
        courses: courses || user.courses || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
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