import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * FileValidationException
 *
 * Custom exception for file validation errors:
 * - File type validation failures
 * - File size validation failures
 * - Field configuration errors
 * - Storage operation failures
 *
 * Extends NestJS HttpException for proper error handling.
 */
export class FileValidationException extends HttpException {
  /**
   * Creates a new FileValidationException.
   * @param message - The error message
   * @param statusCode - HTTP status code (defaults to 400 Bad Request)
   */
  constructor(message: string, statusCode: number = HttpStatus.BAD_REQUEST) {
    super(
      {
        statusCode,
        error: 'File Validation Error',
        message,
      },
      statusCode
    );
  }
} 