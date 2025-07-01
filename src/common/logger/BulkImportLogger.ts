import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';

export class BulkImportLogger {
  private static readonly logger = new Logger('BulkImportLogger');
  private static readonly logDir = 'logs/bulk-import';
  private static readonly winstonLogger = winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(BulkImportLogger.logDir, 'bulk-import-error.log'),
        level: 'error',
      }),
      new winston.transports.File({
        filename: path.join(BulkImportLogger.logDir, 'bulk-import-info.log'),
        level: 'info',
      }),
    ],
  });

  static {
    // Create log directory if it doesn't exist
    if (!fs.existsSync(BulkImportLogger.logDir)) {
      fs.mkdirSync(BulkImportLogger.logDir, { recursive: true });
    }
  }

  static logImportStart(batchId: string, totalRecords: number) {
    const message = `Starting bulk import batch ${batchId} with ${totalRecords} records`;
    this.logger.log(message);
    this.winstonLogger.info({
      event: 'IMPORT_START',
      batchId,
      totalRecords,
      message,
    });
  }

  static logImportEnd(batchId: string, results: {
    totalProcessed: number;
    successCount: number;
    failureCount: number;
  }) {
    const message = `Completed bulk import batch ${batchId}. Processed: ${results.totalProcessed}, Success: ${results.successCount}, Failed: ${results.failureCount}`;
    this.logger.log(message);
    this.winstonLogger.info({
      event: 'IMPORT_END',
      batchId,
      ...results,
      message,
    });
  }

  static logUserCreationSuccess(batchId: string, rowNumber: number, userId: string, username: string) {
    const message = `Successfully created user from row ${rowNumber}: ${username} (${userId})`;
    this.logger.log(message);
    this.winstonLogger.info({
      event: 'USER_CREATION_SUCCESS',
      batchId,
      rowNumber,
      userId,
      username,
      message,
    });
  }

  static logUserCreationError(batchId: string, rowNumber: number, error: any, userData?: any) {
    const message = `Failed to create user from row ${rowNumber}: ${error.message}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'USER_CREATION_ERROR',
      batchId,
      rowNumber,
      error: {
        message: error.message,
        stack: error.stack,
      },
      userData: this.sanitizeUserData(userData),
      message,
    });
  }

  static logCohortMemberCreationSuccess(
    batchId: string,
    rowNumber: number,
    userId: string,
    cohortId: string
  ) {
    const message = `Successfully added user ${userId} to cohort ${cohortId} from row ${rowNumber}`;
    this.logger.log(message);
    this.winstonLogger.info({
      event: 'COHORT_MEMBER_CREATION_SUCCESS',
      batchId,
      rowNumber,
      userId,
      cohortId,
      message,
    });
  }

  static logCohortMemberCreationError(
    batchId: string,
    rowNumber: number,
    userId: string,
    cohortId: string,
    error: any
  ) {
    const message = `Failed to add user ${userId} to cohort ${cohortId} from row ${rowNumber}: ${error.message}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'COHORT_MEMBER_CREATION_ERROR',
      batchId,
      rowNumber,
      userId,
      cohortId,
      error: {
        message: error.message,
        stack: error.stack,
      },
      message,
    });
  }

  static logFileParsingError(batchId: string, error: any) {
    const message = `Failed to parse import file: ${error.message}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'FILE_PARSING_ERROR',
      batchId,
      error: {
        message: error.message,
        stack: error.stack,
      },
      message,
    });
  }

  static logValidationError(batchId: string, rowNumber: number, errors: string[]) {
    const message = `Validation failed for row ${rowNumber}: ${errors.join(', ')}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'VALIDATION_ERROR',
      batchId,
      rowNumber,
      errors,
      message,
    });
  }

  static logElasticsearchError(batchId: string, rowNumber: number, userId: string, error: any) {
    const message = `Failed to update Elasticsearch for user ${userId} from row ${rowNumber}: ${error.message}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'ELASTICSEARCH_ERROR',
      batchId,
      rowNumber,
      userId,
      error: {
        message: error.message,
        stack: error.stack,
      },
      message,
    });
  }

  static logNotificationError(batchId: string, rowNumber: number, userId: string, error: any) {
    const message = `Failed to send notification for user ${userId} from row ${rowNumber}: ${error.message}`;
    this.logger.error(message);
    this.winstonLogger.error({
      event: 'NOTIFICATION_ERROR',
      batchId,
      rowNumber,
      userId,
      error: {
        message: error.message,
        stack: error.stack,
      },
      message,
    });
  }

  private static sanitizeUserData(userData: any) {
    if (!userData) return undefined;
    
    // Create a copy to avoid modifying the original
    const sanitized = { ...userData };
    
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.recaptchaToken;
    
    return sanitized;
  }
} 