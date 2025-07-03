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
    private readonly userElasticsearchService: UserElasticsearchService
  ) {}

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
  }> {
    const batchId = uuidv4();

    const results = {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      failures: [] as Array<{ email: string; error: string }>,
    };

    try {
      BulkImportLogger.initializeLogger(cohortId);
      // Parse file based on mimetype
      const userData = await this.parseFile(file);
      BulkImportLogger.logImportStart(batchId, userData.length);

      const createdUserIds: string[] = [];
      let loginUser = null;
      if (request.headers.authorization) {
        const decoded: any = require('jwt-decode')(
          request.headers.authorization
        );
        loginUser = decoded?.sub;
      }
      // Process each user
      for (let i = 0; i < userData.length; i++) {
        try {
          results.totalProcessed++;
          const user = userData[i];

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

          // Log only serializable part of createdUser
          if (createdUser && createdUser.userId) {
            BulkImportLogger.logUserCreationSuccess(
              batchId,
              i + 2,
              createdUser.userId,
              createdUser.username
            );
            createdUserIds.push(createdUser.userId);

            // Send password reset link using existing function to avoid code duplication
            try {
              // Call the existing sendPasswordResetLink function from PostgresUserService
              // Discard its return value to avoid polluting the bulk import response
              void this.userService.sendPasswordResetLink(
                request, // pass the original request
                createdUser.username, // username
                '', // redirectUrl (empty or set as needed)
                null // do NOT pass the Express response object, so only the summary is sent
              );
            } catch (notifError) {
              BulkImportLogger.logNotificationError(
                batchId,
                i + 2,
                createdUser.userId,
                notifError
              );
            }
          } else {
            BulkImportLogger.logUserCreationError(
              batchId,
              i + 2,
              { message: 'User creation failed' },
              user
            );
          }

          if (!createdUser || !createdUser.userId) {
            throw new Error('Failed to create user');
          }

          BulkImportLogger.logUserCreationSuccess(
            batchId,
            i + 2,
            createdUser.userId,
            user.username
          );

          results.successCount++;
        } catch (error) {
          results.failureCount++;
          // Log only serializable error and user data
          BulkImportLogger.logUserCreationError(
            batchId,
            i + 2,
            { message: error.message, stack: error.stack },
            userData[i]
          );
          results.failures.push({
            email: userData[i]?.email,
            error: error.message,
          });
        }
      }

      // Bulk create cohort members after all users are created
      if (createdUserIds.length > 0) {
        // Pass status: MemberStatus.SHORTLISTED to ensure all created cohort members have status 'shortlisted' at creation time
        await this.cohortMembersService.createBulkCohortMembers(
          loginUser,
          {
            userId: createdUserIds,
            cohortId: [cohortId],
            status: MemberStatus.SHORTLISTED, // Set status at creation
            statusReason: 'Added via bulk import', // Set status reason at creation
          } as any, // Type assertion to allow extra properties
          null,
          tenantId,
          request.headers.academicyearid
        );

        // Now update status to 'shortlisted' for all these users in this cohort and academic year
        await this.cohortMembersRepository
          .createQueryBuilder()
          .update()
          .set({ status: MemberStatus.SHORTLISTED })
          .where('userId IN (:...userIds)', { userIds: createdUserIds })
          .andWhere('cohortId = :cohortId', { cohortId })
          .andWhere('cohortAcademicYearId = :cohortAcademicYearId', {
            cohortAcademicYearId: request.headers.academicyearid,
          })
          .execute();

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
          const fieldIdRegex = /^([^\(]+?)\s*\(([^()]+)\)$/;
          for (const header of xlsxHeaders) {
            const match = fieldIdRegex.exec(header);
            if (match) {
              fieldHeaderMap[header] = {
                label: match[1].trim(),
                fieldId: match[2].trim(),
              };
            }
          }

          // 4. For each user, build customFields and create form submission
          for (let i = 0; i < userData.length; i++) {
            const user = userData[i];
            const userId = createdUserIds[i];
            if (!userId) continue;
            // Build customFields array for this user
            const customFields = Object.entries(fieldHeaderMap).map(
              ([header, { fieldId }]) => ({
                fieldId,
                value:
                  user[header] !== undefined && user[header] !== null
                    ? String(user[header])
                    : '',
              })
            );
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
            try {
              const formSubmissionResult =
                await this.createFormSubmissionForBulk(
                  createFormSubmissionDto,
                  loginUser // adminId for createdBy/updatedBy
                );
            } catch (formError) {
              BulkImportLogger.logUserCreationError(
                batchId,
                i + 2,
                { message: 'Form submission failed', error: formError.message },
                user
              );
              results.failures.push({
                email: user?.email,
                error: 'Form submission failed: ' + formError.message,
              });
            }
          }
        }
      }

      BulkImportLogger.logImportEnd(batchId, {
        totalProcessed: results.totalProcessed,
        successCount: results.successCount,
        failureCount: results.failureCount,
      });

      // After all DB operations, update Elasticsearch with full user document for each user
      if (isElasticsearchEnabled()) {
        for (const userId of createdUserIds) {
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
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    return jsonData.map((row) => this.validateAndTransformRow(row));
  }

  private validateAndTransformRow(row: any): BulkImportUserData {
    // Always set username from email, never from file
    return {
      ...row,
      username: row.email ? row.email.toLowerCase() : undefined,
    };
  }

  private mapToUserCreateDto(userData: BulkImportUserData): UserCreateDto {
    const dto = new UserCreateDto({
      ...userData,
      // other mappings as needed
    });
    // Always set username to email
    dto.username = dto.email;
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
    if (userCreateDto.customFields && userCreateDto.customFields.length > 0) {
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
    if (
      Array.isArray(validatedRoles) &&
      validatedRoles.some((item) => item?.code === undefined)
    ) {
      throw new Error('Invalid roles or academic year.');
    }
    userCreateDto.username = userCreateDto.username.toLocaleLowerCase();
    const userSchema = new UserCreateDto(userCreateDto);
    // Check if user exists in Keycloak or DB
    const keycloakResponse = await getKeycloakAdminToken();
    const token = keycloakResponse.data.access_token;
    const checkUserinKeyCloakandDb =
      await this.userService.checkUserinKeyCloakandDb(userCreateDto);
    if (checkUserinKeyCloakandDb) {
      throw new Error('User already exists.');
    }
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
    // Custom fields update (optional, as in original logic)
    // ... (can be added if needed)
    return result;
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
    const forms = await this.formsService.getFormDetail(
      'COHORTMEMBER', // context
      'COHORTMEMBER', // contextType
      tenantId,
      cohortId
    );
    const activeForm = Array.isArray(forms)
      ? forms.find((f) => f.status === 'active')
      : null;
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

    // Step 3: Extract dynamic fields from form.fields (jsonb)
    let dynamicColumns: string[] = [];
    if (activeForm.fields && Array.isArray(activeForm.fields)) {
      // If fields is an array of field objects
      dynamicColumns = activeForm.fields.map(
        (field: any) => `${field.title} (${field.fieldId})`
      );
    } else if (activeForm.fields && typeof activeForm.fields === 'object') {
      // If fields is an object, flatten and extract
      const extractFields = (obj: any): string[] => {
        let result: string[] = [];
        if (Array.isArray(obj)) {
          for (const item of obj) {
            result = result.concat(extractFields(item));
          }
        } else if (typeof obj === 'object' && obj !== null) {
          if (obj.title && obj.fieldId) {
            result.push(`${obj.title} (${obj.fieldId})`);
          }
          for (const key of Object.keys(obj)) {
            result = result.concat(extractFields(obj[key]));
          }
        }
        return result;
      };
      dynamicColumns = extractFields(activeForm.fields);
    }

    // Step 4: Compose final columns
    const defaultColumns = [
      'firstName',
      'middleName',
      'lastName',
      'email',
      'gender',
      'dob',
      'country',
      'status',
    ];
    const allColumns = [...defaultColumns, ...dynamicColumns];

    // Step 5: Return response
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
    if (existingSubmission) {
      throw new Error('Application with this formId and userId already exists');
    }
    // Create form submission
    const submission = this.formSubmissionService[
      'formSubmissionRepository'
    ].create({
      formId: formSubmission.formId,
      itemId: userId,
      status: formSubmission.status || 'active',
      createdBy: adminId,
      updatedBy: adminId,
    });
    const savedSubmission = await this.formSubmissionService[
      'formSubmissionRepository'
    ].save(submission);
    // Save custom fields
    for (const fieldValue of customFields) {
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
    // Optionally update Elasticsearch, etc. (if needed)
    return savedSubmission;
  }
}
