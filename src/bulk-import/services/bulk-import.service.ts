import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { getKeycloakAdminToken, createUserInKeyCloak } from '../../common/utils/keycloak.adapter.util';
import APIResponse from '../../common/responses/response';
import { APIID } from '../../common/utils/api-id.config';
import { API_RESPONSES } from '../../common/utils/response.messages';

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
    private readonly userService: PostgresUserService,
    private readonly cohortMembersService: PostgresCohortMembersService,
    private readonly notificationRequest: NotificationRequest,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly configService: ConfigService
  ) {}

  async processBulkImport(
    file: Express.Multer.File,
    cohortId: string,
    tenantId: string,
    request: any
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
      // Parse file based on mimetype
      const userData = await this.parseFile(file);
      BulkImportLogger.logImportStart(batchId, userData.length);

      const createdUserIds: string[] = [];
      let loginUser = null;
      if (request.headers.authorization) {
        const decoded: any = require('jwt-decode')(request.headers.authorization);
        loginUser = decoded?.sub;
      }
      // Process each user
      for (let i = 0; i < userData.length; i++) {
        try {
          results.totalProcessed++;
          const user = userData[i];

          // Log only serializable user data
          console.log('Processing user:', JSON.stringify(user));

          // 1. Create user (do not change userService.createUser signature)
          const userCreateDto = this.mapToUserCreateDto(user);
          // Do NOT include cohortIds in tenantRoleMapping to avoid internal cohort member creation
          const tenantRoleMapping: tenantRoleMappingDto = {
            roleId: '493c04e2-a9db-47f2-b304-503da358d5f4',
            cohortIds: [], // Set to empty array to satisfy type, but do not include cohortId
            tenantId: tenantId,
          };
          userCreateDto.tenantCohortRoleMapping = [tenantRoleMapping];

          // Debug logs for validation
          console.log('DEBUG: tenantCohortRoleMapping:', JSON.stringify(userCreateDto.tenantCohortRoleMapping));
    
          // Keep response for compatibility, but do not log or stringify it
          const createdUser = await this.createUserForBulk(request, userCreateDto, request.headers.academicyearid);

          // Log only serializable part of createdUser
          if (createdUser && createdUser.userId) {
            BulkImportLogger.logUserCreationSuccess(batchId, i + 2, createdUser.userId, createdUser.username);
            createdUserIds.push(createdUser.userId);
          } else {
            BulkImportLogger.logUserCreationError(batchId, i + 2, { message: 'User creation failed' }, user);
          }

          if (!createdUser || !createdUser.userId) {
            throw new Error('Failed to create user');
          }

          // Send notification
          const notificationPayload = {
            isQueue: false,
            context: 'USER',
            key: 'onStudentCreated',
            replacements: {
              '{username}': user.firstName || user.username,
              '{programName}': 'the program',
            },
            email: {
              receipients: [user.email],
            },
          };
          try {
            await this.notificationRequest.sendNotification(notificationPayload);
            // Log notification success
            console.log(`Notification sent successfully to ${user.email}`);
          } catch (notifError) {
            BulkImportLogger.logNotificationError(batchId, i + 2, createdUser.userId, notifError);
          }

          // Update Elasticsearch if enabled
          if (isElasticsearchEnabled()) {
            await this.updateElasticsearch(createdUser, cohortId);
          }

          BulkImportLogger.logUserCreationSuccess(batchId, i + 2, createdUser.userId, user.username);

          results.successCount++;
        } catch (error) {
          results.failureCount++;
          // Log only serializable error and user data
          BulkImportLogger.logUserCreationError(batchId, i + 2, { message: error.message, stack: error.stack }, userData[i]);
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
          .where("userId IN (:...userIds)", { userIds: createdUserIds })
          .andWhere("cohortId = :cohortId", { cohortId })
          .andWhere("cohortAcademicYearId = :cohortAcademicYearId", { cohortAcademicYearId: request.headers.academicyearid })
          .execute();
      }

      BulkImportLogger.logImportEnd(batchId, {
        totalProcessed: results.totalProcessed,
        successCount: results.successCount,
        failureCount: results.failureCount,
      });
    
      // Wrap the summary in APIResponse.success
      return APIResponse.success(
        APIID.USER_BULK_IMPORT,
        results,
        200,
        API_RESPONSES.BULK_IMPORT_SUCCESS
      );
    } catch (error) {
      BulkImportLogger.logFileParsingError(batchId, error);
      // Wrap the error in APIResponse.error
      return APIResponse.error(
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
      delete userCreateDto.mobile;
    }
    // Age validation
    const minAge = this.configService.get('MINIMUM_AGE');
    if (userCreateDto?.dob && minAge && !this.isUserOldEnough(userCreateDto.dob, minAge)) {
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
    console.log('DEBUG: validatedRoles:', JSON.stringify(validatedRoles));
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
    const checkUserinKeyCloakandDb = await this.userService.checkUserinKeyCloakandDb(
      userCreateDto
    );
    if (checkUserinKeyCloakandDb) {
      throw new Error('User already exists.');
    }
    // Create user in Keycloak
    const resKeycloak = await createUserInKeyCloak(userSchema, token);
    if (typeof resKeycloak === 'string') {
      throw new Error(resKeycloak);
    }
    if (resKeycloak.statusCode !== 201) {
      throw new Error(resKeycloak.message || 'Failed to create user in Keycloak.');
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
