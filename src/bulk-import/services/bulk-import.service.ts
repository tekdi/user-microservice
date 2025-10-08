import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../../user/entities/user-entity';
import {
  CohortMembers,
  MemberStatus,
} from '../../cohortMembers/entities/cohort-member.entity';
import { BulkImportUserData } from '../dto/bulk-import.dto';
import { Parser } from 'csv-parse';
import * as xlsx from 'xlsx';
import { Readable } from 'stream';
import { PostgresUserService } from '../../adapters/postgres/user-adapter';
import { PostgresCohortMembersService } from '../../adapters/postgres/cohortMembers-adapter';
import { NotificationRequest } from '../../common/utils/notification.axios';
import { LoggerUtil } from '../../common/logger/LoggerUtil';
import { JwtUtil } from '../../common/utils/jwt-token';
import { formatTime } from '../../common/utils/formatTimeConversion';
import { UserCreateDto } from '../../user/dto/user-create.dto';
import { CohortMembersDto } from '../../cohortMembers/dto/cohortMembers.dto';
import { Response } from 'express';
import { tenantRoleMappingDto } from '../../user/dto/user-create.dto';
import { BulkImportLogger } from '../../common/logger/BulkImportLogger';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { isElasticsearchEnabled } from '../../common/utils/elasticsearch.util';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import {
  getKeycloakAdminToken,
  createUserInKeyCloak,
  updateUserInKeyCloak,
} from '../../common/utils/keycloak.adapter.util';
import APIResponse from '../../common/responses/response';
import { randomBytes } from 'crypto';
import { APIID } from '../../common/utils/api-id.config';
import { API_RESPONSES } from '../../common/utils/response.messages';
import { Cohort } from '../../cohort/entities/cohort.entity';
import { Form } from '../../forms/entities/form.entity';
import { FormsService } from '../../forms/forms.service';
import { FormSubmissionService } from '../../forms/services/form-submission.service';
import { FieldValuesDto } from '../../fields/dto/field-values.dto';
import { UserElasticsearchService } from '../../elasticsearch/user-elasticsearch.service';
import { FieldValues } from '../../fields/entities/fields-values.entity';
import { PostgresFieldsService } from '../../adapters/postgres/fields-adapter';
import { HttpService } from '../../common/utils/http-service';

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(Cohort)
    private readonly cohortRepository: Repository<Cohort>,
    @InjectRepository(Form)
    private readonly formRepository: Repository<Form>,
    private readonly userService: PostgresUserService,
    private readonly cohortMembersService: PostgresCohortMembersService,
    private readonly notificationRequest: NotificationRequest,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly configService: ConfigService,
    private readonly formsService: FormsService,
    private readonly formSubmissionService: FormSubmissionService,
    private readonly userElasticsearchService: UserElasticsearchService,
    @InjectRepository(FieldValues)
    private readonly fieldsValueRepository: Repository<FieldValues>,
    private readonly fieldsService: PostgresFieldsService,
    private readonly jwtUtil: JwtUtil,
    private readonly httpService: HttpService
  ) {}

  /**
   * Send progress update to aspire specific service
   * @param importJobId - The import job ID to update
   * @param successIncrement - Number of successful imports to increment by
   * @param failureIncrement - Number of failed imports to increment by
   * @param status - Optional status update
   */
  private async sendProgressUpdate(
    importJobId: string,
    successIncrement: number,
    failureIncrement: number,
    status?: string,
    tenantId?: string,
    authorization?: string
  ): Promise<void> {
    try {
      const aspireSpecificServiceUrl =
        this.configService.get('ASPIRE_SPECIFIC_SERVICE_URL') ||
        '';
      
      // Validate that we have a proper URL
      if (!aspireSpecificServiceUrl || aspireSpecificServiceUrl.trim() === '') {
        this.logger.warn('[BulkImport] ASPIRE_SPECIFIC_SERVICE_URL is not configured, skipping progress update');
        return;
      }

      const updateData: any = {
        successCount: successIncrement,
        failureCount: failureIncrement,
      };

      if (status) {
        updateData.status = status;
      }

      const url = `${aspireSpecificServiceUrl}/aspirespecific/import-users/import-jobs/${importJobId}/progress`;

      this.logger.log(`[BulkImport] Sending progress update to: ${url}`);
      this.logger.log(`[BulkImport] Update data:`, JSON.stringify(updateData));

      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (tenantId) {
        headers['tenantid'] = tenantId;
      }

      if (authorization) {
        headers['Authorization'] = authorization;
      }

      // Use axios instead of httpService for aspire specific service calls
      const axios = require('axios');
      const response = await axios.put(url, updateData, {
        headers,
        timeout: 5000,
      });

      this.logger.log(
        `[BulkImport] Progress update response status: ${response.status}`
      );
      this.logger.log(
        `[BulkImport] Progress update response data:`,
        JSON.stringify(response.data)
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `[BulkImport] Progress update sent successfully: +${successIncrement} success, +${failureIncrement} failures`
        );
      } else {
        this.logger.warn(
          `[BulkImport] Progress update failed with status ${
            response.status
          }: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.logger.error(`[BulkImport] Failed to send progress update:`, error);
      this.logger.error(`[BulkImport] Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      });
      
      // Provide specific guidance for common errors
      if (error.response?.status === 405) {
        this.logger.error(`[BulkImport] HTTP 405 Method Not Allowed - Check if the aspire specific service is running and the URL is correct`);
      } else if (error.code === 'ECONNREFUSED') {
        this.logger.error(`[BulkImport] Connection refused - Check if the aspire specific service is running on the configured URL`);
      }
      
      // Don't throw error - progress update failure shouldn't stop the import
    }
  }

  async processBulkImport(
    file: Express.Multer.File,
    cohortId: string,
    tenantId: string,
    request: any,
    response: Response
  ): Promise<{
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    failures: Array<{ email: string; error: string }>;
    batchId: string;
  }> {
    const batchId = uuidv4();

    const results = {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      failures: [] as Array<{ email: string; error: string }>,
      batchId: batchId,
    };

    try {
      // Validate cohortId
      if (!cohortId || cohortId === 'undefined' || cohortId === 'null') {
        throw new Error('Valid cohort ID is required for bulk import.');
      }

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cohortId)) {
        throw new Error('Cohort ID must be a valid UUID format.');
      }

      BulkImportLogger.initializeLogger(cohortId);
      // Parse file based on mimetype
      const userData = await this.parseFile(file);

      // Validate that userData is an array and has data
      if (!userData || !Array.isArray(userData) || userData.length === 0) {
        throw new Error(
          'No valid data found in the uploaded file. Please check the file format and content.'
        );
      }

      BulkImportLogger.logImportStart(batchId, userData.length);
      console.info(
        `[BulkImport] Starting bulk import for ${userData.length} users`
      );

      const processedUserIds: string[] = []; // Track all processed users (both new and updated)
      const userIdByRowIndex = new Map<number, string>(); // ADD THIS LINE
      let loginUser = null;

      // Ensure processedUserIds is always an array
      if (!processedUserIds || !Array.isArray(processedUserIds)) {
        throw new Error('Failed to initialize user ID tracking array');
      }
      if (request.headers.authorization) {
        const decoded: any = require('jwt-decode')(
          request.headers.authorization
        );
        loginUser = decoded?.sub;
      }
      // Process users in batches to improve performance
      // Dynamic batch sizing based on total users
      let batchSize = 100; // Default for small datasets
      if (userData.length > 1000) {
        batchSize = 200; // Larger batches for big datasets
      } else if (userData.length > 100) {
        batchSize = 100; // Medium batches for medium datasets
      }

      const userBatches = [];
      for (let i = 0; i < userData.length; i += batchSize) {
        userBatches.push(userData.slice(i, i + batchSize));
      }

      // Add timeout for the entire bulk import process (30 minutes)
      const importTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
      const importStartTime = Date.now();

      for (let batchIndex = 0; batchIndex < userBatches.length; batchIndex++) {
        // Check for timeout
        if (Date.now() - importStartTime > importTimeout) {
          console.error(
            `[BulkImport] Import timeout reached after ${
              importTimeout / 1000 / 60
            } minutes`
          );
          throw new Error('Bulk import timeout - process took too long');
        }

        const batch = userBatches[batchIndex];

        // Process users in parallel within each batch
        const batchPromises = batch.map(async (user, userIndex) => {
          const globalIndex = batchIndex * batchSize + userIndex;
          try {
            results.totalProcessed++;

            // Validate user data
            if (!user || typeof user !== 'object') {
              throw new Error(`Invalid user data at row ${globalIndex + 2}`);
            }

            // Validate required fields
            if (!user.email || !user.firstName || !user.lastName) {
              throw new Error(
                `Missing required fields (email, firstName, lastName) at row ${
                  globalIndex + 2
                }`
              );
            }

            // 1. Create user (do not change userService.createUser signature)
            const userCreateDto = this.mapToUserCreateDto(user);
            // Do NOT include cohortIds in tenantRoleMapping to avoid internal cohort member creation
            const tenantRoleMapping: tenantRoleMappingDto = {
              roleId: '493c04e2-a9db-47f2-b304-503da358d5f4',
              cohortIds: [], // Set to empty array to satisfy type, but do not include cohortId
              tenantId: tenantId,
            };
            userCreateDto.tenantCohortRoleMapping = [tenantRoleMapping];

            // Keep response for compatibility, but do not log or stringify it
            const createdUser = await this.createUserForBulk(
              request,
              userCreateDto,
              request.headers.academicyearid
            );

            // Process user (create new or update existing)
            if (createdUser && createdUser.userId) {
              // Add to processed users list
              processedUserIds.push(createdUser.userId);
              userIdByRowIndex.set(globalIndex, createdUser.userId);
              // Check if this was a new user or existing user update
              const isNewUser = !(createdUser as any).isUpdated;

              // Log appropriate message based on whether user was created or updated
              if (isNewUser) {
                BulkImportLogger.logUserCreationSuccess(
                  batchId,
                  globalIndex + 2,
                  createdUser.userId,
                  createdUser.username
                );
              } else {
                // Log update success instead of creation success
                this.logger.log(
                  `[BulkImportLogger] Successfully updated user from row ${
                    globalIndex + 2
                  }: ${createdUser.username} (${createdUser.userId})`
                );
              }
              results.successCount++;

              return {
                success: true,
                user: createdUser,
                index: globalIndex,
                isNewUser,
              };
            } else {
              throw new Error('Failed to process user');
            }
          } catch (error) {
            results.failureCount++;
            // Log only serializable error and user data
            BulkImportLogger.logUserCreationError(
              batchId,
              globalIndex + 2,
              { message: error.message, stack: error.stack },
              user
            );
            results.failures.push({
              email: user?.email || 'Unknown',
              error: error.message,
            });
            return { success: false, error: error.message, index: globalIndex };
          }
        });

        // Wait for all users in this batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Calculate batch success and failure counts
        const batchSuccessCount = batchResults.filter(result => result.success).length;
        const batchFailureCount = batchResults.filter(result => !result.success).length;

        // Send progress update for this batch (fire-and-forget)
        // Skip progress updates when called by Kafka consumer to prevent double counting
        if (request.headers['x-import-job-id'] && 
            !request.headers['x-kafka-consumer'] && 
            (batchSuccessCount > 0 || batchFailureCount > 0)) {
          const importJobId = request.headers['x-import-job-id'];
          void this.sendProgressUpdate(
            importJobId,
            batchSuccessCount,
            batchFailureCount,
            undefined, // Don't update status, just counts
            tenantId,
            request.headers.authorization
          );
        }

        // Send notifications for all successful users (both new and existing) - Non-blocking
        const notificationPromises = batchResults
          .filter((result) => result.success)
          .map(async (result) => {
            try {
              await this.sendBulkImportNotification(
                request,
                result.user,
                batchId,
                result.index + 2
              );
            } catch (notifError) {
              // Log error but don't fail the import
              console.error(
                `[BulkImport] Notification failed for user ${result.user.username}: ${notifError.message}`
              );
              BulkImportLogger.logNotificationError(
                batchId,
                result.index + 2,
                result.user.userId,
                notifError
              );
            }
          });

        // Don't wait for notifications - let them run in background
        Promise.all(notificationPromises).catch((error) => {
          console.error(
            `[BulkImport] Background notification error: ${error.message}`
          );
        });
      }

      // Handle cohort membership for all processed users
      if (processedUserIds.length > 0) {
        try {
          // Create or update cohort members for all users (new and existing)
          // The createBulkCohortMembers method now handles upsert logic internally
          await this.cohortMembersService.createBulkCohortMembers(
            loginUser,
            {
              userId: processedUserIds,
              cohortId: [cohortId],
              status: MemberStatus.SHORTLISTED,
              statusReason: 'Updated via bulk import',
            } as any,
            null,
            tenantId,
            request.headers.academicyearid
          );
        } catch (cohortError) {
          this.logger.error(
            `Failed to update cohort membership: ${cohortError.message}`
          );
          // Don't fail the entire import for cohort errors
        }

        // --- BULK FORM SUBMISSION CREATION ---
        // 1. Get the active form for this cohort
        const forms = await this.formsService.getFormDetail(
          'COHORTMEMBER', // context
          'COHORTMEMBER', // contextType
          tenantId,
          cohortId
        );
        const activeForm = Array.isArray(forms)
          ? forms.find((f) => f.status === 'active')
          : null;
        if (activeForm && activeForm.formid && activeForm.fields) {
          // 2. Build a map of field label+id from xlsx headers
          // Assume file is xlsx and parse headers
          let xlsxHeaders: string[] = [];
          if (
            file.mimetype ===
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel'
          ) {
            const workbook = xlsx.read(file.buffer, { type: 'buffer' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const headerRow = xlsx.utils.sheet_to_json(worksheet, {
              header: 1,
            })[0];
            xlsxHeaders = Array.isArray(headerRow) ? headerRow : [];
          } else if (file.mimetype === 'text/csv') {
            // For CSV, use keys from the first userData row
            xlsxHeaders = userData.length > 0 ? Object.keys(userData[0]) : [];
          }

          // 3. Extract fieldId from headers in format: Label (fieldId)
          const fieldHeaderMap: {
            [header: string]: { fieldId: string; label: string };
          } = {};
          const fieldIdRegex = /^(.+?)\s*\(([^()]+)\)$/;
          for (const header of xlsxHeaders) {
            const match = fieldIdRegex.exec(header);
            if (match) {
              fieldHeaderMap[header] = {
                label: match[1].trim(),
                fieldId: match[2].trim(),
              };
            }
          }

          // 4. Process form submissions in optimized batches for better performance
          const formSubmissionBatchSize = 10; // Increased batch size for better throughput
          const formSubmissionBatches = [];
          for (let i = 0; i < userData.length; i += formSubmissionBatchSize) {
            formSubmissionBatches.push(
              userData.slice(i, i + formSubmissionBatchSize)
            );
          }

          let formSubmissionsCreated = 0;

          for (
            let batchIndex = 0;
            batchIndex < formSubmissionBatches.length;
            batchIndex++
          ) {
            // Check for timeout
            if (Date.now() - importStartTime > importTimeout) {
              console.error(
                `[BulkImport] Form submission timeout reached after ${
                  importTimeout / 1000 / 60
                } minutes`
              );
              throw new Error(
                'Bulk import form submission timeout - process took too long'
              );
            }

            const batch = formSubmissionBatches[batchIndex];

            const formSubmissionPromises = batch.map(
              async (user, userIndex) => {
                const globalIndex =
                  batchIndex * formSubmissionBatchSize + userIndex;
                const userId = userIdByRowIndex.get(globalIndex);
                if (!userId)
                  return {
                    success: false,
                    error: 'User ID not found',
                    index: globalIndex,
                  };

                try {
                  // Build customFields array for this user
                  const customFields =
                    fieldHeaderMap && Object.keys(fieldHeaderMap).length > 0
                      ? Object.entries(fieldHeaderMap).map(
                          ([header, { fieldId }]) => {
                            let fieldValue = user[header] !== undefined && user[header] !== null
                              ? String(user[header])
                              : '';
                            
                            // Convert pipe-separated values to comma-separated values
                            if (fieldValue && fieldValue.includes('|')) {
                              fieldValue = this.convertPipeToCommaSeparated(fieldValue);
                            }
                            
                            return {
                              fieldId,
                              value: fieldValue,
                            };
                          }
                        )
                      : [];
                  // Build CreateFormSubmissionDto
                  const createFormSubmissionDto = {
                    userId: userId, // The imported user's ID
                    tenantId: tenantId,
                    formSubmission: {
                      formId: activeForm.formid,
                      status: 'active',
                    },
                    customFields,
                  };
                  // Call internal method to create form submission with correct userId, createdBy, updatedBy
                  // Add timeout and retry logic for form submissions
                  await Promise.race([
                    this.createFormSubmissionForBulk(
                      createFormSubmissionDto,
                      loginUser // adminId for createdBy/updatedBy
                    ),
                    new Promise(
                      (_, reject) =>
                        setTimeout(
                          () => reject(new Error('Form submission timeout')),
                          10000
                        ) // 10 second timeout
                    ),
                  ]);
                  return { success: true, userId, index: globalIndex };
                } catch (formError) {
                  this.logger.error(
                    `[DEBUG] Form submission failed for user ${userId}: ${formError.message}`
                  );
                  BulkImportLogger.logUserCreationError(
                    batchId,
                    globalIndex + 2,
                    {
                      message: 'Form submission failed',
                      error: formError.message,
                    },
                    user
                  );
                  return {
                    success: false,
                    error: formError.message,
                    index: globalIndex,
                    userId,
                  };
                }
              }
            );

            // Wait for all form submissions in this batch to complete
            const formSubmissionResults = await Promise.all(
              formSubmissionPromises
            );

            // Count successful form submissions
            const successfulSubmissions = formSubmissionResults.filter(
              (result) => result.success
            ).length;
            formSubmissionsCreated += successfulSubmissions;

            // Log failures
            formSubmissionResults
              .filter((result) => !result.success)
              .forEach((result) => {
                results.failures.push({
                  email: userData[result.index]?.email || 'Unknown',
                  error: 'Form submission failed: ' + result.error,
                });
              });
          }
        }
      }

      BulkImportLogger.logImportEnd(batchId, {
        totalProcessed: results.totalProcessed,
        successCount: results.successCount,
        failureCount: results.failureCount,
      });
      console.info(
        `[BulkImport] Completed bulk import: ${results.successCount} successful, ${results.failureCount} failed`
      );

      // Send final progress update to mark import as completed (fire-and-forget)
      // Skip progress updates when called by Kafka consumer to prevent double counting
      if (request.headers['x-import-job-id'] && !request.headers['x-kafka-consumer']) {
        const importJobId = request.headers['x-import-job-id'];
        void this.sendProgressUpdate(
          importJobId,
          0, // No additional counts - only status update
          0, // No additional counts - only status update
          'completed',
          tenantId,
          request.headers.authorization
        );
      }

      // After all DB operations, update Elasticsearch with full user document for each user
      if (isElasticsearchEnabled()) {
        for (let i = 0; i < userData.length; i++) {
          const userId = userIdByRowIndex.get(i);
          if (!userId) continue;
          try {
            const userDoc =
              await this.formSubmissionService.buildUserDocumentForElasticsearch(
                userId
              );
            // END TEST LOG
            if (userDoc) {
              // For testing: add a comment here to indicate this is the new ES logic
              // New ES logic: upsert full user document after all DB operations
              await this.userElasticsearchService.createUser(userDoc);
            }
          } catch (esError) {
            BulkImportLogger.logElasticsearchError(batchId, 0, userId, esError);
          }
        }
      }

      // Wrap the summary in APIResponse.success
      return APIResponse.success(
        response,
        APIID.USER_BULK_IMPORT,
        results,
        200,
        API_RESPONSES.BULK_IMPORT_SUCCESS
      );
    } catch (error) {
      BulkImportLogger.logFileParsingError(batchId, error);
      // Wrap the error in APIResponse.error
      return APIResponse.error(
        response,
        APIID.USER_BULK_IMPORT,
        error.message || API_RESPONSES.BULK_IMPORT_FAILURE,
        error.message || 'Failed to process bulk import',
        400
      );
    }
  }

  private async parseFile(
    file: Express.Multer.File
  ): Promise<BulkImportUserData[]> {
    if (file.mimetype === 'text/csv') {
      return this.parseCSV(file);
    } else if (
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      return this.parseExcel(file);
    }
    throw new Error(
      'Unsupported file type. Please upload a CSV or Excel file.'
    );
  }

  private async parseCSV(
    file: Express.Multer.File
  ): Promise<BulkImportUserData[]> {
    return new Promise((resolve, reject) => {
      const results: BulkImportUserData[] = [];
      const stream = Readable.from(file.buffer);

      stream
        .pipe(
          new Parser({
            columns: true,
            skip_empty_lines: true,
          })
        )
        .on('data', (data) => results.push(this.validateAndTransformRow(data)))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  private parseExcel(file: Express.Multer.File): BulkImportUserData[] {
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('No sheets found in the Excel file');
      }
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) {
        throw new Error('First sheet is empty or invalid');
      }
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        throw new Error('No data found in the Excel file');
      }
      return jsonData.map((row) => this.validateAndTransformRow(row));
    } catch (error) {
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  private validateAndTransformRow(row: any): BulkImportUserData {
    // Ensure row is an object
    if (!row || typeof row !== 'object') {
      throw new Error('Invalid row data: row must be an object');
    }

    // Process all field values to convert pipe-separated values to comma-separated
    const processedRow = { ...row };
    for (const [key, value] of Object.entries(processedRow)) {
      if (typeof value === 'string' && value.includes('|')) {
        processedRow[key] = this.convertPipeToCommaSeparated(value);
      }
    }

    // Always set username from email, never from file
    return {
      ...processedRow,
      username: processedRow.email ? processedRow.email.toLowerCase() : undefined,
    };
  }

  /**
   * Converts pipe-separated values to comma-separated values
   * @param value - The string value that may contain pipe separators
   * @returns The converted string with comma separators
   */
  private convertPipeToCommaSeparated(value: string): string {
    if (!value || typeof value !== 'string') {
      return value;
    }
    
    // Replace pipe separators with comma separators
    return value.replace(/\|/g, ',');
  }

  private mapToUserCreateDto(userData: BulkImportUserData): UserCreateDto {
    const dto = new UserCreateDto({
      ...userData,
      // other mappings as needed
    });
    // Always set username to email
    dto.username = dto.email;
    // Set status to inactive for bulk imported users
    dto.status = 'inactive';
    // Ensure customFields is always an array to prevent undefined errors
    if (!dto.customFields) {
      dto.customFields = [];
    }

    // Handle dob field - map from Excel column to dob field
    if (userData['date of birth (yyyy-mm-dd)']) {
      dto.dob = userData['date of birth (yyyy-mm-dd)'];
    }

    return dto;
  }

  private async updateElasticsearch(user: User, cohortId: string) {
    const userDoc = {
      userId: user.userId,
      profile: {
        userId: user.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
      },
      applications: [
        {
          cohortId: cohortId,
          status: 'shortlisted',
          cohortmemberstatus: 'active',
        },
      ],
    };

    await this.elasticsearchService.index('users', user.userId, userDoc);
  }

  /**
   * Core user creation logic for bulk import (no Express response handling)
   */
  private async createUserForBulk(
    request: any,
    userCreateDto: UserCreateDto,
    academicYearId: string
  ): Promise<User> {
    // Set createdBy/updatedBy from token if present
    if (request.headers.authorization) {
      const decoded: any = require('jwt-decode')(request.headers.authorization);
      userCreateDto.createdBy = decoded?.sub;
      userCreateDto.updatedBy = decoded?.sub;
    }
    // Auto-generate password if not provided
    if (!userCreateDto.password) {
      userCreateDto.password = this.generateRandomPassword();
    }
    // Always set username to email (in case mapping missed it)
    userCreateDto.username = userCreateDto.email;
    // Remove mobile if empty or not provided, to skip validation
    if (!userCreateDto.mobile || userCreateDto.mobile.trim() === '') {
      userCreateDto.mobile = undefined;
    }

    // For bulk import, mobile is optional - if not provided, remove it from the DTO to skip validation
    if (!userCreateDto.mobile) {
      delete userCreateDto.mobile;
    }
    // Age validation
    const minAge = this.configService.get('MINIMUM_AGE');
    if (
      userCreateDto?.dob &&
      minAge &&
      !this.isUserOldEnough(userCreateDto.dob, minAge)
    ) {
      throw new Error(`User must be at least ${minAge} years old.`);
    }
    // Custom field validation
    if (
      userCreateDto.customFields &&
      Array.isArray(userCreateDto.customFields) &&
      userCreateDto.customFields.length > 0
    ) {
      const customFieldError = await this.userService.validateCustomField(
        userCreateDto,
        null,
        null
      );
      if (customFieldError) {
        throw new Error(`Custom field error: ${customFieldError}`);
      }
    }
    // Validate request body (roles, academic year, etc.)
    const validatedRoles: any = await this.userService.validateRequestBody(
      userCreateDto,
      academicYearId
    );
    // Handle validation response - it can return error messages or role objects
    if (Array.isArray(validatedRoles)) {
      // Check if the array contains error messages (strings) instead of role objects
      const hasErrorMessages = validatedRoles.some(
        (item) => typeof item === 'string'
      );

      if (hasErrorMessages) {
        console.error(
          `[CREATE_USER_FOR_BULK] Validation errors found for email: ${userCreateDto.email}`,
          {
            errors: validatedRoles,
          }
        );
        throw new Error(`Validation failed: ${validatedRoles.join('; ')}`);
      }

      // Check if roles are valid (have code property)
      const invalidItems = validatedRoles.filter(
        (item) => item?.code === undefined
      );
      if (invalidItems.length > 0) {
        console.error(
          `[CREATE_USER_FOR_BULK] Invalid roles found for email: ${userCreateDto.email}`,
          {
            invalidItems,
            allRoles: validatedRoles,
          }
        );
        throw new Error('Invalid roles or academic year.');
      }
    } else if (validatedRoles === false) {
      throw new Error('No tenant cohort role mapping provided.');
    }
    userCreateDto.username = userCreateDto.username.toLocaleLowerCase();
    const userSchema = new UserCreateDto(userCreateDto);
    // Get Keycloak admin token
    const keycloakResponse = await getKeycloakAdminToken();
    const token = keycloakResponse.data.access_token;

    // Check if user exists in Keycloak or DB
    const checkUserinKeyCloakandDb =
      await this.userService.checkUserinKeyCloakandDb(userCreateDto);

    if (checkUserinKeyCloakandDb) {
      // User exists - update existing user
      console.info(
        `[BulkImport] Updating existing user: ${userCreateDto.email}`
      );

      try {
        // Find existing user in Keycloak
        const existingUserData = await this.findExistingUser(
          userCreateDto,
          token
        );
        if (existingUserData) {
          return await this.updateExistingUserForBulk(
            request,
            userCreateDto,
            academicYearId,
            existingUserData
          );
        } else {
          throw new Error('User exists but could not be found in Keycloak');
        }
      } catch (updateError) {
        this.logger.error(
          `Failed to update existing user: ${updateError.message}`
        );
        throw new Error(
          `Failed to update existing user: ${updateError.message}`
        );
      }
    } else {
      // User doesn't exist - create new user
      console.info(`[BulkImport] Creating new user: ${userCreateDto.email}`);

      try {
        // Create user in Keycloak
        const resKeycloak = await createUserInKeyCloak(userSchema, token);
        if (typeof resKeycloak === 'string') {
          throw new Error(resKeycloak);
        }
        if (resKeycloak.statusCode !== 201) {
          throw new Error(
            resKeycloak.message || 'Failed to create user in Keycloak.'
          );
        }
        userCreateDto.userId = resKeycloak.userId;

        // Create user in DB
        const result = await this.userService.createUserInDatabase(
          request,
          userCreateDto,
          academicYearId,
          null
        );

        // Mark as new user
        (result as any).isUpdated = false;
        return result;
      } catch (createError) {
        // If creation fails with "user exists" error, try to find and update
        if (
          createError.message &&
          (createError.message.includes('User exists with same username') ||
            createError.message.includes('User exists'))
        ) {
          try {
            const existingUserData = await this.findExistingUser(
              userCreateDto,
              token
            );
            if (existingUserData) {
              return await this.updateExistingUserForBulk(
                request,
                userCreateDto,
                academicYearId,
                existingUserData
              );
            }
          } catch (findError) {
            this.logger.error(
              `Failed to find existing user: ${findError.message}`
            );
          }
        }

        // Only log the error if it's not a "user exists" error that we're handling
        if (
          !createError.message ||
          (!createError.message.includes('User exists with same username') &&
            !createError.message.includes('User exists'))
        ) {
          this.logger.error(`User creation failed: ${createError.message}`);
        }

        throw createError;
      }
    }
  }

  /**
   * Send bulk import specific notification for users
   */
  private async sendBulkImportNotification(
    request: any,
    user: any,
    batchId: string,
    rowNumber: number
  ): Promise<void> {
    try {
      // Get user details with tenant information
      const userData: any = await this.userService.findUserDetails(
        null,
        user.username
      );
      if (!userData) {
        throw new Error('User data not found');
      }

      // Validate required fields
      if (!userData.email) {
        throw new Error('User email not found');
      }
      if (!userData.userId) {
        throw new Error('User ID not found');
      }

      // Generate token for password reset
      const tokenPayload = {
        sub: user.userId,
        email: userData.email,
      };

      const jwtExpireTime = this.configService.get<string>(
        'PASSWORD_RESET_JWT_EXPIRES_IN'
      );
      const jwtSecretKey = this.configService.get<string>('RBAC_JWT_SECRET');
      const frontEndUrl = `${this.configService.get<string>(
        'RESET_FRONTEND_URL'
      )}/reset-password`;
      const backEndUrl = `${this.configService.get<string>(
        'RESET_BACKEND_URL'
      )}/reset-password`;

      const resetToken = await this.jwtUtil.generateTokenForForgotPassword(
        tokenPayload,
        jwtExpireTime,
        jwtSecretKey
      );

      // Format expiration time
      const time = formatTime(jwtExpireTime);
      const programName = userData?.tenantData?.[0]?.tenantName;
      const capilatizeFirstLettterOfProgram = programName
        ? programName.charAt(0).toUpperCase() + programName.slice(1)
        : 'Learner Account';

      // Determine redirect URL for reset password based on user role
      const userRole = userData?.tenantData?.[0]?.roleName;
      let resetPasswordUrlPath = frontEndUrl;

      if (userRole === 'Admin' || userRole === 'Regional Admin') {
        resetPasswordUrlPath = backEndUrl;
      }

      // Use bulk import specific notification key
      const notificationKey =
        userData?.status === 'inactive'
          ? 'onBulkStudentCreated'
          : 'OnForgotPasswordReset';

      // Send Notification with bulk import specific template
      const notificationPayload = {
        isQueue: false,
        context: 'USER',
        key: notificationKey,
        replacements: {
          '{username}':
            userData?.firstName && userData?.lastName
              ? `${userData.firstName} ${userData.lastName}`.trim()
              : userData?.firstName || userData?.username,
          '{firstName}': userData?.firstName || '',
          '{lastName}': userData?.lastName || '',
          '{resetToken}': resetToken,
          '{programName}': capilatizeFirstLettterOfProgram,
          '{expireTime}': time,
          '{resetPasswordUrl}': resetPasswordUrlPath,
          '{redirectUrl}': '', // Empty for bulk import
        },
        email: {
          receipients: [userData.email],
        },
      };

      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload
      );

      // Check for errors in the email sending process
      if (
        mailSend?.result?.email?.errors &&
        mailSend.result.email.errors.length > 0
      ) {
        const errorMessages = mailSend.result.email.errors.map((error) =>
          typeof error === 'string'
            ? error
            : error.error || JSON.stringify(error)
        );
        throw new Error(`Email sending failed: ${errorMessages.join(', ')}`);
      }
    } catch (error) {
      console.error(
        `[BulkImport] Failed to send notification for user ${user.username}:`,
        {
          message: error.message,
          stack: error.stack,
          error: error,
        }
      );
      // Don't throw error - let the import continue even if notifications fail
      // The notification failure is logged but doesn't stop the import
    }
  }

  /**
   * Helper to check if user is old enough
   */
  private isUserOldEnough(dob: string, minAge: number): boolean {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= minAge;
  }

  /**
   * Helper to generate a random password
   */
  private generateRandomPassword(length = 10): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    const bytes = randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars[bytes[i] % chars.length];
    }
    return password;
  }

  /**
   * Generates the xlsx template columns for a given cohortId.
   * Returns the response as per requirements, or error if cohort/form is not active.
   */
  async generateXlsxTemplateColumns(
    cohortId: string,
    tenantId: string
  ): Promise<any> {
    // Step 1: Check if cohort is active
    const cohort = await this.cohortRepository.findOne({ where: { cohortId } });
    if (!cohort || cohort.status !== 'active') {
      return {
        id: 'api.cohort.download-xlsx-template',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuidv4(),
          status: 'failed',
          err: 'COHORT_NOT_ACTIVE',
          errmsg: 'Cohort is not active',
          successmessage: null,
        },
        responseCode: 400,
        result: { data: [] },
      };
    }

    // Step 2: Get active form for this cohortId as contextId, using tenantId from header
    let activeForm: any = null;
    try {
      const forms = await this.formsService.getFormDetail(
        'COHORTMEMBER', // context
        'COHORTMEMBER', // contextType
        tenantId,
        cohortId
      );
      activeForm = Array.isArray(forms)
        ? forms.find((f) => f.status === 'active')
        : null;
    } catch (error) {
      this.logger.error('Failed to fetch cohort form for template generation', {
        error: error.message,
        cohortId,
        tenantId,
      });
      return {
        id: 'api.cohort.download-xlsx-template',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuidv4(),
          status: 'failed',
          err: 'FORM_FETCH_ERROR',
          errmsg: 'Failed to fetch form data',
          successmessage: null,
        },
        responseCode: 500,
        result: { data: [] },
      };
    }

    if (!activeForm) {
      return {
        id: 'api.cohort.download-xlsx-template',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuidv4(),
          status: 'failed',
          err: 'ACTIVE_FORM_NOT_FOUND',
          errmsg: 'Active form for this cohort is not available',
          successmessage: null,
        },
        responseCode: 400,
        result: { data: [] },
      };
    }

    // Step 2.1: Get profile form using getForm method with formType=rjsf
    let activeProfileForm: any = null;

    try {
      // Create a mock response object for the getForm method
      const mockResponse = {
        status: (code: number) => mockResponse,
        json: (data: any) => data,
      };

      // Call getForm directly with formType=rjsf
      const requiredData = {
        context: 'USERS',
        contextType: 'STUDENT',
        tenantId: tenantId,
        formType: 'rjsf',
      };

      const formResponse = await this.formsService.getForm(
        requiredData,
        mockResponse
      );

      // Extract the form data from the response
      if (formResponse && formResponse.result) {
        activeProfileForm = formResponse.result;
      }
    } catch (error) {
      // Fallback: try without formType parameter
      try {
        const profileForms = await this.formsService.getFormDetail(
          'USERS', // context
          'STUDENT', // contextType
          tenantId,
          tenantId // use tenantId as contextId
        );
        activeProfileForm = Array.isArray(profileForms)
          ? profileForms.find((f) => f.status === 'active')
          : null;
      } catch (fallbackError) {
        // If both methods fail, continue without profile form
        this.logger.warn(
          'Failed to fetch profile form for template generation',
          {
            error: fallbackError.message,
            tenantId,
            cohortId,
          }
        );
      }
    }

    // Step 3: Extract dynamic fields from both forms
    // Define core fields that should be excluded from dynamic extraction
    const coreFieldsToExclude = [
      'firstName',
      'lastName',
      'email',
      'gender',
      'dob',
      'country',
    ];

    // Helper function to extract fields from a form
    const extractFieldsFromForm = (form: any): string[] => {
      let result: string[] = [];
      if (!form) return result;

      // Handle different form structures
      let fieldsToProcess: any = null;

      // Check if it's a profile form with schema.properties structure
      if (form.schema && form.schema.properties) {
        fieldsToProcess = form.schema.properties;
      }
      // Check if it's a regular form with fields property
      else if (form.fields) {
        fieldsToProcess = form.fields;
      }

      if (!fieldsToProcess) return result;

      if (Array.isArray(fieldsToProcess)) {
        // If fields is an array of field objects
        result = fieldsToProcess
          .filter((field: any) => field.title && field.fieldId)
          .map((field: any, index: number) => {
            // Try to get field name from field object or use index
            const fieldName = field.fieldName || field.name || `field_${index}`;
            return `${fieldName} (${field.fieldId})`;
          });
      } else if (typeof fieldsToProcess === 'object') {
        // If fields is an object, extract all fields dynamically
        const extractFields = (obj: any, parentKey: string = ''): string[] => {
          let fields: string[] = [];
          if (Array.isArray(obj)) {
            for (const item of obj) {
              fields = fields.concat(extractFields(item, parentKey));
            }
          } else if (typeof obj === 'object' && obj !== null) {
            if (obj.title && obj.fieldId) {
              // Check if this field should be excluded (core fields)
              const fieldKey =
                parentKey ||
                Object.keys(fieldsToProcess).find(
                  (key) => fieldsToProcess[key] === obj
                );

              // Only include if it's not a core field
              if (!coreFieldsToExclude.includes(fieldKey)) {
                // Include field name and field ID
                const fieldName = fieldKey || 'unknown_field';
                fields.push(`${fieldName} (${obj.fieldId})`);
              }
            }
            for (const key of Object.keys(obj)) {
              fields = fields.concat(extractFields(obj[key], key));
            }
          }
          return fields;
        };
        result = extractFields(fieldsToProcess);
      }

      // Also handle dependencies section for profile forms (current address fields)
      if (form.schema && form.schema.dependencies) {
        const dependencies = form.schema.dependencies;
        for (const [key, dependency] of Object.entries(dependencies)) {
          if (typeof dependency === 'object' && dependency !== null) {
            const depObj = dependency as any;
            if (depObj.oneOf && Array.isArray(depObj.oneOf)) {
              for (const oneOfItem of depObj.oneOf) {
                if (oneOfItem.properties) {
                  // Extract fields from dependencies using the same logic
                  const extractDependencyFields = (
                    obj: any,
                    parentKey: string = ''
                  ): string[] => {
                    let fields: string[] = [];
                    if (Array.isArray(obj)) {
                      for (const item of obj) {
                        fields = fields.concat(
                          extractDependencyFields(item, parentKey)
                        );
                      }
                    } else if (typeof obj === 'object' && obj !== null) {
                      if (obj.title && obj.fieldId) {
                        // Check if this field should be excluded (core fields)
                        const fieldKey =
                          parentKey ||
                          Object.keys(obj).find((key) => obj[key] === obj);

                        // Only include if it's not a core field
                        if (!coreFieldsToExclude.includes(fieldKey)) {
                          // Include field name and field ID
                          const fieldName = fieldKey || 'unknown_field';
                          fields.push(`${fieldName} (${obj.fieldId})`);
                        }
                      }
                      for (const key of Object.keys(obj)) {
                        fields = fields.concat(
                          extractDependencyFields(obj[key], key)
                        );
                      }
                    }
                    return fields;
                  };
                  const depFields = extractDependencyFields(
                    oneOfItem.properties,
                    ''
                  );
                  result = result.concat(depFields);
                }
              }
            }
          }
        }
      }

      return result;
    };

    // Extract fields from cohort form
    let cohortDynamicColumns: string[] = extractFieldsFromForm(activeForm);

    // Extract fields from profile form (if available)
    let profileDynamicColumns: string[] = [];
    if (activeProfileForm) {
      profileDynamicColumns = extractFieldsFromForm(activeProfileForm);
    }

    // Combine all dynamic columns
    const dynamicColumns = [...cohortDynamicColumns, ...profileDynamicColumns];

    // Step 4: Compose final columns
    const defaultColumns = [
      'firstName',
      'lastName',
      'email',
      'gender',
      'date of birth (yyyy-mm-dd)',
      'country',
    ];

    const allColumns = [...defaultColumns, ...dynamicColumns];

    // Step 5: Log success and return response
    this.logger.log('XLSX template columns generated successfully', {
      cohortId,
      tenantId,
      totalColumns: allColumns.length,
      cohortFields: cohortDynamicColumns.length,
      profileFields: profileDynamicColumns.length,
      hasProfileForm: !!activeProfileForm,
    });

    return {
      id: 'api.cohort.download-xlsx-template',
      ver: '1.0',
      ts: new Date().toISOString(),
      params: {
        resmsgid: uuidv4(),
        status: 'successful',
        err: null,
        errmsg: null,
        successmessage: 'Template created successfully',
      },
      responseCode: 200,
      result: {
        data: allColumns,
      },
    };
  }

  /**
   * Internal helper to create a form submission for bulk import, setting userId as itemId and admin as createdBy/updatedBy
   */
  private async createFormSubmissionForBulk(
    createFormSubmissionDto: any,
    adminId: string
  ) {
    // Directly use the repository to avoid token-based userId extraction
    const { userId, tenantId, formSubmission, customFields } =
      createFormSubmissionDto;
    // Check if form exists and is active
    const form = await this.formRepository.findOne({
      where: {
        formid: formSubmission.formId,
        status: 'active',
      },
    });
    if (!form) {
      throw new Error(
        'Form with the provided formId does not exist or is not active'
      );
    }
    // Check for existing submission
    const existingSubmission = await this.formSubmissionService[
      'formSubmissionRepository'
    ].findOne({
      where: {
        formId: formSubmission.formId,
        itemId: userId,
        status: In(['active', 'inactive']),
      },
    });

    let savedSubmission;
    if (existingSubmission) {
      // Update existing form submission
      console.info(`[BulkImport] Updating form submission for user: ${userId}`);
      existingSubmission.status = formSubmission.status || 'active';
      existingSubmission.completionPercentage = 100; // Set completion to 100% for bulk import
      existingSubmission.updatedBy = adminId;
      existingSubmission.updatedAt = new Date();
      savedSubmission = await this.formSubmissionService[
        'formSubmissionRepository'
      ].save(existingSubmission);
    } else {
      // Create new form submission
      console.info(`[BulkImport] Creating form submission for user: ${userId}`);
      const submission = this.formSubmissionService[
        'formSubmissionRepository'
      ].create({
        formId: formSubmission.formId,
        itemId: userId,
        status: formSubmission.status || 'active',
        completionPercentage: 100, // Set completion to 100% for bulk import
        createdBy: adminId,
        updatedBy: adminId,
      });
      savedSubmission = await this.formSubmissionService[
        'formSubmissionRepository'
      ].save(submission);
    }
    // Save/Update custom fields
    if (
      customFields &&
      Array.isArray(customFields) &&
      customFields.length > 0
    ) {
      for (const fieldValue of customFields) {
        try {
          // Validate field ID is a valid UUID
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(fieldValue.fieldId)) {
            this.logger.warn(
              `Skipping invalid field ID: ${fieldValue.fieldId} (not a valid UUID)`
            );
            continue;
          }

          // Check if field value already exists
          const existingFieldValue = await this.fieldsValueRepository.findOne({
            where: {
              itemId: userId,
              fieldId: fieldValue.fieldId,
            },
          });

          if (existingFieldValue) {
            // Update existing field value
            await this.fieldsService.updateFieldValues(
              existingFieldValue.fieldValuesId,
              {
                fieldValuesId: existingFieldValue.fieldValuesId,
                value: fieldValue.value,
                status: 'active' as any,
              }
            );
          } else {
            // Create new field value
            const fieldValueDto = new FieldValuesDto({
              fieldId: fieldValue.fieldId,
              value: fieldValue.value,
              itemId: userId,
              createdBy: adminId,
              updatedBy: adminId,
            });
            await this.formSubmissionService['fieldsService'].createFieldValues(
              null,
              fieldValueDto
            );
          }
        } catch (fieldError) {
          this.logger.error(
            `Failed to process field value ${fieldValue.fieldId}: ${fieldError.message}`
          );
        }
      }
    }
    // Optionally update Elasticsearch, etc. (if needed)
    return savedSubmission;
  }

  /**
   * Find existing user in Keycloak by email or username
   */
  private async findExistingUser(
    userCreateDto: UserCreateDto,
    token: string
  ): Promise<any> {
    try {
      const axios = require('axios');

      // Try to find by email first
      if (userCreateDto.email) {
        const emailSearchUrl = `${process.env.KEYCLOAK}${
          process.env.KEYCLOAK_ADMIN
        }?email=${encodeURIComponent(userCreateDto.email)}`;

        try {
          const emailResponse = await axios.get(emailSearchUrl, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (emailResponse.data && emailResponse.data.length > 0) {
            console.info(
              `[BulkImport] Found existing user by email: ${userCreateDto.email}`
            );
            return { data: emailResponse.data };
          }
        } catch (emailError) {
          // Email search failed, continue to username search
        }
      }

      // Try to find by username
      if (userCreateDto.username) {
        const usernameSearchUrl = `${process.env.KEYCLOAK}${
          process.env.KEYCLOAK_ADMIN
        }?username=${encodeURIComponent(userCreateDto.username)}&exact=true`;

        try {
          const usernameResponse = await axios.get(usernameSearchUrl, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (usernameResponse.data && usernameResponse.data.length > 0) {
            console.info(
              `[BulkImport] Found existing user by username: ${userCreateDto.username}`
            );
            return { data: usernameResponse.data };
          }
        } catch (usernameError) {
          // Username search failed
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error finding existing user: ${error.message}`);
      return null;
    }
  }

  /**
   * Update existing user for bulk import
   */
  private async updateExistingUserForBulk(
    request: any,
    userCreateDto: UserCreateDto,
    academicYearId: string,
    existingUserData: any
  ): Promise<User> {
    try {
      console.info(
        `[BulkImport] Updating existing user: ${userCreateDto.email}`
      );

      // Extract existing user ID from Keycloak data
      const existingUserId = existingUserData.data?.[0]?.id;
      if (!existingUserId) {
        throw new Error('Could not extract user ID from existing user data');
      }

      // Get Keycloak admin token
      const keycloakResponse = await getKeycloakAdminToken();
      const token = keycloakResponse.data.access_token;

      // Update user in Keycloak
      const updateQuery = {
        userId: existingUserId,
        firstName: userCreateDto.firstName,
        lastName: userCreateDto.lastName,
        username: userCreateDto.username,
        email: userCreateDto.email,
      };
      await updateUserInKeyCloak(updateQuery, token);

      // Update basic user details in database
      const updateUserDto = {
        firstName: userCreateDto.firstName,
        lastName: userCreateDto.lastName,
        middleName: userCreateDto.middleName,
        gender: userCreateDto.gender,
        email: userCreateDto.email,
        country: userCreateDto.country,
        state: userCreateDto.state,
        dob: userCreateDto.dob ? new Date(userCreateDto.dob) : undefined,
        mobile: userCreateDto.mobile ? Number(userCreateDto.mobile) : undefined,
      };

      await this.userService.updateBasicUserDetails(
        existingUserId,
        updateUserDto
      );

      // Update custom fields if provided
      if (
        userCreateDto.customFields &&
        Array.isArray(userCreateDto.customFields)
      ) {
        for (const customField of userCreateDto.customFields) {
          try {
            // Check if field value exists
            const existingFieldValue = await this.fieldsValueRepository.findOne(
              {
                where: {
                  itemId: existingUserId,
                  fieldId: customField.fieldId,
                },
              }
            );

            if (existingFieldValue) {
              // Update existing field value
              await this.fieldsService.updateFieldValues(
                existingFieldValue.fieldValuesId,
                {
                  fieldValuesId: existingFieldValue.fieldValuesId,
                  value: customField.value,
                  status: 'active' as any,
                }
              );
            } else {
              // Create new field value
              const fieldValueDto = {
                fieldId: customField.fieldId,
                value: customField.value,
                itemId: existingUserId,
                createdBy: request.headers.authorization
                  ? require('jwt-decode')(request.headers.authorization)?.sub
                  : null,
                updatedBy: request.headers.authorization
                  ? require('jwt-decode')(request.headers.authorization)?.sub
                  : null,
              };
              await this.fieldsValueRepository.save(fieldValueDto);
            }
          } catch (fieldError) {
            this.logger.error(
              `[DEBUG] Failed to update custom field ${customField.fieldId}: ${fieldError.message}`
            );
          }
        }
      }

      // Get the updated user from database
      const updatedUser = await this.userRepository.findOne({
        where: { userId: existingUserId },
      });

      if (!updatedUser) {
        throw new Error('User not found after update');
      }

      // Mark the user as updated for tracking purposes
      (updatedUser as any).isUpdated = true;
      return updatedUser;
    } catch (error) {
      this.logger.error(
        `[DEBUG] Failed to update existing user: ${error.message}`
      );
      throw new Error(`Failed to update existing user: ${error.message}`);
    }
  }
}
