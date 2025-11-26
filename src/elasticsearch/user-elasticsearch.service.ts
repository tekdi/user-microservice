import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { IUser, IApplication, ICourse } from './interfaces/user.interface';
import { v4 as uuidv4 } from 'uuid';
import { isElasticsearchEnabled } from '../common/utils/elasticsearch.util';
@Injectable()
export class UserElasticsearchService implements OnModuleInit {
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
      this.logger.error(`Failed to delete index ${this.indexName}:`, error);
      throw error;
    }
  }

  async initialize() {
    try {
      // Delete existing index if it exists
      // await this.deleteIndex();

      // Explicitly map all possible fields in customFields as text/keyword to avoid mapping conflicts
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
                country: { type: 'keyword' },
                customFields: {
                  type: 'nested',
                  properties: {
                    // NOTE: We intentionally expose only the fields needed for search.
                    // Any additional metadata coming from DB (fieldValuesId, context, state,
                    // fieldParams, etc.) will either be stripped before indexing or stored
                    // but *not* indexed.
                    fieldId: { type: 'keyword' },
                    code: { type: 'keyword' }, // Always treat as string
                    label: { type: 'text' },
                    type: { type: 'keyword' },
                    value: { type: 'text' }, // Always treat as string for flexibility
                    // Store fieldParams in _source only (any shape is accepted)
                    // and do NOT index it so it can be any array/object without
                    // causing mapping conflicts.
                    fieldParams: {
                      type: 'object',
                      enabled: false,
                    },
                  },
                },
              },
            },
            applications: {
              type: 'nested',
              properties: {
                cohortId: { type: 'keyword' },
                cohortmemberstatus: { type: 'keyword' },
                formstatus: { type: 'keyword' },
                completionPercentage: { type: 'float' }, // FIXED: Add completionPercentage field
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
      this.logger.log(
        `Index ${this.indexName} created successfully with mappings`
      );
    } catch (error) {
      this.logger.error('Failed to initialize Elasticsearch index:', error);
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
      const applications = user.applications || [];
      const elasticUser: IUser = {
        userId: user.userId,
        profile: this.normalizeProfileForElasticsearch(
          user.profile,
          applications
        ),
        applications,
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
      this.logger.error('Failed to create user in Elasticsearch:', error);
      throw new Error(
        `Failed to create user in Elasticsearch: ${error.message}`
      );
    }
  }

  /**
   * Update only the profile field in the Elasticsearch document for a user.
   * If the document does not exist, fetch the user from the database and create it.
   * @param userId
   * @param profile
   * @param fetchUserFromDb Optional callback to fetch user from DB if needed
   */
  async updateUserProfile(
    userId: string,
    profile: any,
    fetchUserFromDb?: (userId: string) => Promise<IUser | null>
  ): Promise<any> {
    try {
      // Try to update the profile field in Elasticsearch
      const normalizedProfile = this.normalizeProfileForElasticsearch(profile);
      return await this.updateUser(userId, {
        doc: { profile: normalizedProfile },
      });
    } catch (error: any) {
      // If the document is missing, create it from DB
      if (
        error?.meta?.body?.error?.type === 'document_missing_exception' &&
        fetchUserFromDb
      ) {
        // Fetch user from DB
        const userFromDb = await fetchUserFromDb(userId);
        if (userFromDb) {
          return await this.createUser(userFromDb);
        } else {
          throw new Error(`User with ID ${userId} not found in DB for upsert.`);
        }
      }
      // Rethrow other errors
      throw error;
    }
  }

  /**
   * Normalize profile object before indexing/updating in Elasticsearch.
   * Ensures `customFields` match the compact shape expected in the index
   * and that internal DB-only fields (fieldValuesId, context, state, etc.)
   * or heavy metadata (fieldParams.options) are not used for search.
   */
  private normalizeProfileForElasticsearch(
    profile: any,
    applications?: any[]
  ): any {
    if (!profile) {
      return profile;
    }

    const normalized: any = {
      userId: profile.userId,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      middleName: profile.middleName,
      email: profile.email,
      mobile: profile.mobile,
      mobile_country_code: profile.mobile_country_code,
      gender: profile.gender,
      dob: profile.dob,
      country: profile.country,
      status: profile.status,
    };

    const rawCustomFields = profile.customFields || [];

    // Build a set of fieldIds that are clearly part of application forms,
    // based on the application.progress.pages[*].fields maps. Any customField
    // whose fieldId appears here will be treated as an application field
    // and excluded from profile.customFields.
    const applicationFieldIds = new Set<string>();
    if (Array.isArray(applications)) {
      for (const app of applications) {
        const pages = app?.progress?.pages || {};
        for (const page of Object.values(pages)) {
          const fields = (page as any)?.fields || {};
          for (const fieldId of Object.keys(fields)) {
            if (fieldId) {
              applicationFieldIds.add(fieldId);
            }
          }
        }
      }
    }

    normalized.customFields = Array.isArray(rawCustomFields)
      ? rawCustomFields
          .filter((field: any) => {
            if (!field) return false;
            const fieldId =
              field.fieldId ?? field.fieldid ?? field.id ?? undefined;

            // If context is present and is not USERS, treat this as a non-profile
            // field (e.g., form/application field) and exclude it from
            // profile.customFields. This ensures that only true profile-level
            // custom fields remain under profile, even when applications array
            // is empty or not yet populated.
            const context = field.context ?? field.contextType;
            if (context && context !== 'USERS') {
              return false;
            }

            // If this fieldId is used inside any application.progress page,
            // we consider it an application field and do NOT keep it under
            // profile.customFields.
            if (fieldId && applicationFieldIds.has(String(fieldId))) {
              return false;
            }
            return true;
          })
          .map((field: any) => {
            if (!field) {
              return field;
            }

            const fieldId = field.fieldId ?? field.fieldid ?? field.id;
            const label = field.label ?? field.fieldname ?? field.name ?? '';
            const value = field.value ?? '';
            const code = field.code ?? value ?? '';
            const type = field.type ?? null;

            return {
              fieldId,
              code,
              label,
              type,
              value,
            };
          })
      : [];

    return normalized;
  }

  /**
   * Update user document in Elasticsearch. If missing, create from DB.
   * @param userId
   * @param updateData
   * @param fetchUserFromDb Optional callback to fetch user from DB if needed
   */
  async updateUser(
    userId: string,
    updateData: any,
    fetchUserFromDb?: (userId: string) => Promise<IUser | null>
  ): Promise<any> {
    try {
      return await this.elasticsearchService.update(
        this.indexName,
        userId,
        updateData,
        { retry_on_conflict: 3 }
      );
    } catch (error: any) {
      // If the document is missing, create it from DB
      if (
        error?.meta?.body?.error?.type === 'document_missing_exception' &&
        fetchUserFromDb
      ) {
        const userFromDb = await fetchUserFromDb(userId);
        if (userFromDb) {
          return await this.createUser(userFromDb);
        } else {
          throw new Error(`User with ID ${userId} not found in DB for upsert.`);
        }
      }
      throw error;
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
      this.logger.error('Failed to delete user from Elasticsearch:', error);
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
      this.logger.error('Failed to get user from Elasticsearch:', error);
      throw new Error(
        `Failed to get user from Elasticsearch: ${error.message}`
      );
    }
  }

  /**
   * Search users in Elasticsearch with support for filters, limit, and offset.
   *
   * This method now returns the response in the required Aspire Leaders API format:
   * {
   *   id: 'api.ES.Fetch',
   *   ver: '1.0',
   *   ts: <timestamp>,
   *   params: { ... },
   *   responseCode: 200,
   *   result: {
   *     data: [...],
   *     totalCount: <number>
   *   }
   * }
   *
   * - Accepts POST body with limit, offset, and filters.
   * - Handles pagination in the service (not controller).
   * - If limit/offset are not provided, returns up to 10,000 records (safe cap).
   * - All formatting and logic are handled here for consistency and reusability.
   */
  async searchUsers(body: any) {
    const logger = new Logger('UserElasticsearchService');
    try {
      if (!body) {
        throw new Error('Search query is required');
      }
      const { limit, offset, ...query } = body;

      // Add validation for limit and offset
      if (
        (limit !== undefined && (isNaN(Number(limit)) || Number(limit) < 0)) ||
        (offset !== undefined && (isNaN(Number(offset)) || Number(offset) < 0))
      ) {
        throw new Error('limit and offset must be positive numbers');
      }

      const searchQuery = {
        bool: {
          must: [],
          filter: [],
        },
      };
      // Add text search with partial matching support
      if (query.q) {
        if (typeof query.q !== 'string') {
          throw new Error('Search query must be a string');
        }
        const searchTerm = query.q.trim();
        if (searchTerm.length > 0) {
          const textSearchQuery = {
            bool: {
              should: [
                {
                  prefix: {
                    'profile.firstName': {
                      value: searchTerm.toLowerCase(),
                      boost: 3.0,
                    },
                  },
                },
                {
                  prefix: {
                    'profile.lastName': {
                      value: searchTerm.toLowerCase(),
                      boost: 3.0,
                    },
                  },
                },
                {
                  prefix: {
                    'profile.country': {
                      value: searchTerm.toLowerCase(),
                      boost: 3.0,
                    },
                  },
                },
                {
                  wildcard: {
                    'profile.firstName': {
                      value: `*${searchTerm.toLowerCase()}*`,
                      boost: 2.0,
                    },
                  },
                },
                {
                  wildcard: {
                    'profile.lastName': {
                      value: `*${searchTerm.toLowerCase()}*`,
                      boost: 2.0,
                    },
                  },
                },
                {
                  wildcard: {
                    'profile.country': {
                      value: `*${searchTerm.toLowerCase()}*`,
                      boost: 2.0,
                    },
                  },
                },
                {
                  term: {
                    'profile.email': {
                      value: searchTerm.toLowerCase(),
                      boost: 4.0,
                    },
                  },
                },
                {
                  term: {
                    'profile.username': {
                      value: searchTerm.toLowerCase(),
                      boost: 4.0,
                    },
                  },
                },
                {
                  fuzzy: {
                    'profile.firstName': {
                      value: searchTerm,
                      fuzziness: 'AUTO',
                      boost: 1.0,
                    },
                  },
                },
                {
                  fuzzy: {
                    'profile.lastName': {
                      value: searchTerm,
                      fuzziness: 'AUTO',
                      boost: 1.0,
                    },
                  },
                },
                {
                  fuzzy: {
                    'profile.country': {
                      value: searchTerm,
                      fuzziness: 'AUTO',
                      boost: 1.0,
                    },
                  },
                },
                // Search in custom fields
                {
                  nested: {
                    path: 'profile.customFields',
                    query: {
                      bool: {
                        should: [
                          {
                            match: {
                              'profile.customFields.value': {
                                query: searchTerm,
                                boost: 2.0,
                              },
                            },
                          },
                          {
                            match: {
                              'profile.customFields.fieldname': {
                                query: searchTerm,
                                boost: 2.0,
                              },
                            },
                          },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                    score_mode: 'max',
                  },
                },
              ],
              minimum_should_match: 1,
            },
          };
          searchQuery.bool.must.push(textSearchQuery);
        }
      }
      if (query.filters && typeof query.filters === 'object') {
        // Special handling for cohortId and cohortmemberstatus in applications
        const appFilters: any = {};
        Object.entries(query.filters).forEach(([field, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            // Handle cohortId, cohortmemberstatus, and completionPercentage as nested application filters
            if (
              field === 'cohortId' ||
              field === 'cohortmemberstatus' ||
              field === 'completionPercentage'
            ) {
              appFilters[field] = value;
              return;
            }

            // Handle custom fields filtering
            if (field.startsWith('customFields.')) {
              const customFieldName = field.replace('customFields.', '');

              searchQuery.bool.filter.push({
                nested: {
                  path: 'profile.customFields',
                  query: {
                    bool: {
                      must: [
                        // Match by fieldId
                        {
                          term: {
                            'profile.customFields.fieldId': customFieldName,
                          },
                        },
                        // Match by value (flexible match)
                        {
                          bool: {
                            should: [
                              {
                                term: {
                                  'profile.customFields.value': String(value),
                                },
                              },
                              {
                                wildcard: {
                                  'profile.customFields.value': `*${String(
                                    value
                                  ).toLowerCase()}*`,
                                },
                              },
                              {
                                match: {
                                  'profile.customFields.value': {
                                    query: String(value),
                                    operator: 'or',
                                    fuzziness: 'AUTO',
                                  },
                                },
                              },
                            ],
                            minimum_should_match: 1,
                          },
                        },
                      ],
                    },
                  },
                },
              });
              return;
            }

            // For name fields, use wildcard for partial/case-insensitive match
            if (
              [
                'firstName',
                'lastName',
                'middleName',
                'username',
                'email',
                'status',
                'district',
                'state',
                'pincode',
                'gender',
                'address',
                'country',
              ].includes(field)
            ) {
              // Special handling for country to support multiple countries
              if (field === 'country') {
                // Check if value is an array (multiple countries)
                if (Array.isArray(value) && value.length > 0) {
                  const countries = value
                    .map((v) => String(v).trim())
                    .filter((v) => v.length > 0);
                  if (countries.length > 0) {
                    searchQuery.bool.filter.push({
                      bool: {
                        should: countries.map((c) => ({
                          term: {
                            [`profile.${field}`]: {
                              value: c,
                              case_insensitive: true,
                            },
                          },
                        })),
                        minimum_should_match: 1,
                      },
                    });
                  }
                } else {
                  const country = String(value).trim();
                  if (country.length > 0) {
                    searchQuery.bool.filter.push({
                      term: {
                        [`profile.${field}`]: {
                          value: country,
                          case_insensitive: true,
                        },
                      },
                    });
                  }
                }
              } else {
                searchQuery.bool.filter.push({
                  wildcard: {
                    [`profile.${field}`]: `*${String(value).toLowerCase()}*`,
                  },
                });
              }
            } else if (field.includes('.')) {
              // For nested fields (not applications)
              const [nestedPath, nestedField] = field.split('.');
              searchQuery.bool.filter.push({
                nested: {
                  path: nestedPath,
                  query: {
                    wildcard: {
                      [`${nestedPath}.${nestedField}`]: `*${String(
                        value
                      ).toLowerCase()}*`,
                    },
                  },
                },
              });
            } else {
              // Default to wildcard for all other string fields
              searchQuery.bool.filter.push({
                wildcard: {
                  [`profile.${field}`]: `*${String(value).toLowerCase()}*`,
                },
              });
            }
          }
        });
        // If cohortId, cohortmemberstatus, or completionPercentage filters are present, add nested application filter
        if (
          appFilters.cohortId ||
          appFilters.cohortmemberstatus ||
          appFilters.completionPercentage
        ) {
          const appMust: any[] = [];
          if (appFilters.cohortId) {
            appMust.push({
              wildcard: {
                'applications.cohortId': `*${String(
                  appFilters.cohortId
                ).toLowerCase()}*`,
              },
            });
          }
          if (appFilters.cohortmemberstatus) {
            if (Array.isArray(appFilters.cohortmemberstatus)) {
              // Validate array contains only strings
              const validStatuses = appFilters.cohortmemberstatus.filter(
                (v) => typeof v === 'string' && v.trim().length > 0
              );
              if (validStatuses.length === 0) {
                throw new Error(
                  'cohortmemberstatus array must contain valid string values'
                );
              }
              // Use terms query for multiple statuses
              appMust.push({
                terms: {
                  'applications.cohortmemberstatus': validStatuses.map((v) =>
                    v.toLowerCase()
                  ),
                },
              });
            } else {
              // Validate single value is a string
              if (typeof appFilters.cohortmemberstatus !== 'string') {
                throw new Error(
                  'cohortmemberstatus must be a string or array of strings'
                );
              }
              // Fallback to wildcard for single string
              appMust.push({
                wildcard: {
                  'applications.cohortmemberstatus': `*${String(
                    appFilters.cohortmemberstatus
                  ).toLowerCase()}*`,
                },
              });
            }
          }
          if (appFilters.completionPercentage !== undefined) {
            const completionValue = Number(appFilters.completionPercentage);
            if (!isNaN(completionValue)) {
              appMust.push({
                range: {
                  'applications.completionPercentage': {
                    gte: completionValue,
                    lte: completionValue,
                  },
                },
              });
            }
          }
          searchQuery.bool.filter.push({
            nested: {
              path: 'applications',
              query: { bool: { must: appMust } },
            },
          });
        }
      }
      if (query.cohortId && typeof query.cohortId === 'string') {
        searchQuery.bool.filter.push({
          nested: {
            path: 'applications',
            query: { term: { 'applications.cohortId': query.cohortId } },
          },
        });
      }
      const size = limit ? Math.min(Number(limit), 10000) : 100;
      const from = offset ? Math.max(Number(offset), 0) : 0;

      const esResult = await this.elasticsearchService.search(
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
              'applications.completionPercentage',
              'courses.*',
              'createdAt',
              'updatedAt',
            ],
          },
        }
      );
      // Format the response as required
      let hits = esResult.hits || [];
      // If cohortId filter is present, filter applications array in each user
      const cohortIdFilter = query.filters?.cohortId ?? query.cohortId;
      if (cohortIdFilter) {
        hits = hits.map((hit: any) => {
          if (hit._source && Array.isArray(hit._source.applications)) {
            hit._source.applications = hit._source.applications.filter(
              (app: any) => app.cohortId === cohortIdFilter
            );
          }
          return hit;
        });
      }
      return {
        id: 'api.ES.Fetch',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuidv4(),
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Elasticsearch  Fetch successfully',
        },
        responseCode: 200,
        result: {
          data: hits,
          totalCount: esResult.total?.value ?? esResult.total ?? 0,
        },
      };
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

  /**
   * Update or add an application (form submission) for a user in Elasticsearch.
   * If the user document is missing, fetch user from DB and create it with the application.
   * @param userId
   * @param application
   * @param fetchUserFromDb Optional callback to fetch user from DB if needed
   */
  async updateApplication(
    userId: string,
    application: IApplication,
    fetchUserFromDb?: (userId: string) => Promise<IUser | null>
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
              // Process field value for Elasticsearch - convert arrays to comma-separated strings
              fields[fieldId] = this.processFieldValueForElasticsearch(value);
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

        // Calculate completion percentage
        const completionPercentage =
          totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        mappedApplication.completionPercentage = completionPercentage;

        // Also update formData with the same structure
        mappedApplication.formData = application.formData;
      } else if (application.completionPercentage !== undefined) {
        // If completionPercentage is provided directly, use it
        mappedApplication.completionPercentage =
          application.completionPercentage;
      } else {
        // Default to 0 if no form data and no completion percentage provided
        mappedApplication.completionPercentage = 0;
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

      if (exists) {
        await this.elasticsearchService.update(this.indexName, userId, {
          script,
        });
      } else if (fetchUserFromDb) {
        // If the user document does not exist, fetch from DB and create
        const userFromDb = await fetchUserFromDb(userId);
        if (userFromDb) {
          // Add the new application to the user's applications array
          userFromDb.applications = [application];
          await this.createUser(userFromDb);
        } else {
          throw new Error(`User with ID ${userId} not found in DB for upsert.`);
        }
      } else {
        throw new Error(
          'User document not found in Elasticsearch and no fetchUserFromDb callback provided.'
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to update application in Elasticsearch:',
        error
      );
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
      this.logger.error('Error updating course in Elasticsearch:', error);
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
              
              // Recalculate completion percentage
              int totalFields = 0;
              int completedFields = 0;
              
              // Count total and completed fields across all pages
              for (String pageKey : ctx._source.applications[i].progress.pages.keySet()) {
                Map page = ctx._source.applications[i].progress.pages[pageKey];
                if (page != null && page.fields != null) {
                  for (String fieldKey : page.fields.keySet()) {
                    totalFields++;
                    Object fieldValue = page.fields[fieldKey];
                    if (fieldValue != null && fieldValue.toString().trim().length() > 0) {
                      completedFields++;
                    }
                  }
                }
              }
              
              // Calculate completion percentage
              if (totalFields > 0) {
                ctx._source.applications[i].completionPercentage = Math.round((completedFields * 100.0) / totalFields);
              } else {
                ctx._source.applications[i].completionPercentage = 0;
              }
              
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
            
            // Calculate completion percentage for new application
            int totalFields = 0;
            int completedFields = 0;
            
            // Count fields in the current page
            if (params.pageData.fields != null) {
              for (String fieldKey : params.pageData.fields.keySet()) {
                totalFields++;
                Object fieldValue = params.pageData.fields[fieldKey];
                if (fieldValue != null && fieldValue.toString().trim().length() > 0) {
                  completedFields++;
                }
              }
            }
            
            // Calculate completion percentage
            if (totalFields > 0) {
              application.completionPercentage = Math.round((completedFields * 100.0) / totalFields);
            } else {
              application.completionPercentage = 0;
            }
            
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
      this.logger.error(
        'Error updating application page in Elasticsearch:',
        error
      );
      throw new Error(
        `Failed to update application page in Elasticsearch: ${error.message}`
      );
    }
  }

  async onModuleInit() {
    if (isElasticsearchEnabled()) {
      await this.initialize();
    }
  }

  /**
   * Helper function to process field values for Elasticsearch storage.
   * Converts array values to comma-separated strings for multiselect fields.
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
}
