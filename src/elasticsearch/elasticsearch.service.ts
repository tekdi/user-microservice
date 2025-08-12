// src/elasticsearch/elasticsearch.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { IUser, IProfile } from './interfaces/user.interface';
import { isElasticsearchEnabled } from '../common/utils/elasticsearch.util';

interface SearchResponse {
  hits: {
    hits: Array<{
      _id: string;
      _index: string;
      _score: number;
      _ignored?: string[];
      _source: IUser;
    }>;
    total: {
      value: number;
      relation: string;
    };
  };
}

@Injectable()
export class ElasticsearchService {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly client: Client;

  constructor(private readonly configService: ConfigService) {
    if (isElasticsearchEnabled()) {
      const node =
        process.env.ELASTICSEARCH_HOST ??
        'http://localhost:9200';
      this.logger.log(`Attempting to connect to Elasticsearch host: ${node}`);
      this.client = new Client({ node });

      // Listen for connection events
      this.client.diagnostic.on('response', (err, result) => {
        if (err) {
           // Don't log document_missing_exception as an error since it's expected behavior
           if ((err as any)?.meta?.body?.error?.type === 'document_missing_exception') {
            this.logger.debug(`Elasticsearch: Document not found (this is expected for new users or missing records).`);
          } else if ((err as any)?.meta && (err as any).meta.statusCode === 404) {
            this.logger.debug(`Elasticsearch: Document not found (404, expected for new users).`);
          } else {
            this.logger.error('Elasticsearch connection or query error:', err.message || err);
          }
        } else if (result && result.meta && result.meta.connection) {
          this.logger.log(
            `Elasticsearch host ${result.meta.connection.url.href} responded with status ${result.statusCode}`
          );
        }
      });

      // Initial ping
      this.client
        .ping()
        .then(() => {
          this.logger.log(`Successfully connected to Elasticsearch host: ${node}`);
        })
        .catch((error) => {
          this.logger.error(`Failed to connect to Elasticsearch host: ${node}`, error);
        });
    } else {
      this.logger.log('Elasticsearch is disabled by USE_ELASTICSEARCH flag.');
      // @ts-ignore
      this.client = undefined;
    }
  }

  async initialize(indexName: string, mappings: any) {
    try {
      await this.createIndex(indexName, {
        mappings,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          wait_for_active_shards: 1,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to initialize index ${indexName}:`, error);
      throw error;
    }
  }

  async index(indexName: string, id: string, document: any) {
    try {
      await this.client.index({
        index: indexName,
        id,
        document,
        refresh: true,
      });
      this.logger.log(`Document indexed successfully in ${indexName}`);
    } catch (error) {
      this.logger.error(`Failed to index document in ${indexName}:`, error);
      throw error;
    }
  }

  async update(
    indexName: string,
    id: string,
    body: any,
    options: Record<string, any> = {}
  ) {
    try {
      await this.client.update({
        index: indexName,
        id,
        body,
        refresh: true,
        ...options,
      });
      this.logger.log(`Document updated successfully in ${indexName}`);
    } catch (error) {
       // Don't log document_missing_exception as an error since it's expected behavior
    // when trying to update a document that doesn't exist
    if (error?.meta?.body?.error?.type === 'document_missing_exception') {
      this.logger.debug(`Document ${id} not found in ${indexName} - this is expected for new documents`);
      throw error; // Still throw the error so calling code can handle it
    }
      this.logger.error(`Failed to update document in ${indexName}:`, error);
      throw error;
    }
  }

  async get(indexName: string, id: string) {
    try {
      const response = await this.client.get({
        index: indexName,
        id,
      });
      return response;
    } catch (error) {
      if (error.meta?.statusCode === 404) {
        // Don't log 404 as error since it's expected for missing documents
        return null;
      }
      this.logger.error(`Failed to get document from ${indexName}:`, error);
      throw error;
    }
  }

  async search(
    index: string,
    query: Record<string, any>,
    options: Record<string, any> = {}
  ) {
    try {
      const response = (await this.client.search({
        index,
        ...options,
        query,
        track_total_hits: true,
      })) as SearchResponse;

      if (!response.hits?.hits || response.hits.hits.length === 0) {
        return {
          hits: [],
          total: response.hits.total || { value: 0, relation: "eq" },
        };
      }

      const transformedHits = response.hits.hits.map((hit) => {
        const source = hit._source;

        return {
          _id: hit._id,
          _index: hit._index,
          _score: hit._score,
          _ignored: hit._ignored || [],
          _source: {
            userId: source?.userId || "",
            profile: {
              userId: source?.userId || '',
              username: source?.profile?.username || '',
              firstName: source?.profile?.firstName || '',
              lastName: source?.profile?.lastName || '',
              middleName: source?.profile?.middleName || '',
              email: source?.profile?.email || '',
              mobile: source?.profile?.mobile || '',
              mobile_country_code: source?.profile?.mobile_country_code || '',
              gender: source?.profile?.gender || '',
              dob:source?.profile?.dob || '',
              country:source?.profile?.country || '',
              address: source?.profile?.address || '',
              district: source?.profile?.district || '',
              state: source?.profile?.state || '',
              pincode: source?.profile?.pincode || '',
              status: source?.profile?.status || 'active',
              customFields: source?.profile?.customFields || [],
            },
            applications:
              source?.applications?.map((app) => ({
                cohortId: app.cohortId || "",
                formId: app.formId || "",
                submissionId: app.submissionId || "",
                cohortmemberstatus: app.cohortmemberstatus || "",
                formstatus: app.formstatus || "",
                completionPercentage: app.completionPercentage || 0,
                progress: app.progress || {},
                lastSavedAt: app.lastSavedAt || null,
                submittedAt: app.submittedAt || null,
                cohortDetails: app.cohortDetails || {},
                courses: app.courses || null,
              })) || [],
            // Removed root-level courses field as requested
            createdAt: source?.createdAt || null,
            updatedAt: source?.updatedAt || null,
          },
        };
      });

      return {
        hits: transformedHits,
        total: response.hits.total,
      };
    } catch (error) {
      this.logger.error(`Failed to search in ${index}:`, error);
      throw error;
    }
  }

  async updateApplication(userId: string, application: any) {
    try {
      const script = {
        source: `
          if (ctx._source.applications == null) {
            ctx._source.applications = [];
          }
          
          boolean found = false;
          for (int i = 0; i < ctx._source.applications.length; i++) {
            if (ctx._source.applications[i].cohortId == params.application.cohortId) {
              ctx._source.applications[i] = params.application;
              found = true;
              break;
            }
          }
          
          if (!found) {
            ctx._source.applications.add(params.application);
          }
          
          ctx._source.updatedAt = params.updatedAt;
        `,
        lang: "painless",
        params: {
          application,
          updatedAt: new Date().toISOString(),
        },
      };

      const defaultProfile: IProfile = {
        userId,
        username: "",
        firstName: "",
        lastName: "",
        middleName: "",
        email: "",
        mobile: "",
        mobile_country_code: "",
        gender: "",
        dob: null,
        country:'',
        address: '',
        district: '',
        state: '',
        pincode: '',
        status: 'active',
        customFields: [],
      };

      const updateBody = {
        script,
        upsert: {
          userId,
          profile: defaultProfile,
          applications: [application],
          // Removed root-level courses field as requested
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      await this.update("users", userId, updateBody);
      this.logger.log(
        `Application for user ${userId} updated successfully in Elasticsearch`
      );
    } catch (error) {
      this.logger.error(
        `Failed to update application for user ${userId}: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to update application: ${error.message}`);
    }
  }

  async searchUsers(query: any) {
    try {
      const response = await this.search("users", query);
      return response.hits.map((hit) => ({
        _id: hit._id,
        ...hit._source,
      }));
    } catch (error) {
      this.logger.error("Failed to search users:", error);
      throw error;
    }
  }

  async getApplication(userId: string) {
    try {
      const response = await this.get("users", userId);
      if (!response || !response._source) {
        return null;
      }

      const user = response._source as IUser;
      if (!user.applications || !Array.isArray(user.applications)) {
        return null;
      }

      // Return the first application found for the user
      return user.applications[0] || null;
    } catch (error) {
      this.logger.error(`Failed to get application for user ${userId}:`, error);
      throw error;
    }
  }

  async delete(indexName: string, id: string) {
    try {
      await this.client.delete({
        index: indexName,
        id,
      });
      this.logger.log(`Document deleted successfully from ${indexName}`);
    } catch (error) {
      this.logger.error(`Failed to delete document from ${indexName}:`, error);
      throw error;
    }
  }

  async bulk(operations: any[]) {
    try {
      const response = await this.client.bulk({
        refresh: true,
        operations,
      });
      return response;
    } catch (error) {
      this.logger.error("Bulk operation failed:", error);
      throw error;
    }
  }

  async createIndex(index: string, mapping: Record<string, any>) {
    try {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({
          index,
          body: mapping,
          wait_for_active_shards: 1, // Ensure at least one shard is active
        });
        this.logger.log(`Index ${index} created successfully`);
      } else {
        this.logger.log(`Index ${index} already exists`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to create index ${index}: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to create index: ${error.message}`);
    }
  }

  async indexExists(index: string) {
    try {
      return await this.client.indices.exists({ index });
    } catch (error) {
      this.logger.error(
        `Failed to check if index ${index} exists: ${error.message}`
      );
      throw error;
    }
  }

  async deleteIndex(index: string) {
    try {
      return await this.client.indices.delete({ index });
    } catch (error) {
      this.logger.error(`Failed to delete index ${index}: ${error.message}`);
      throw error;
    }
  }

  async ping() {
    return this.client.ping();
  }
}
