import { HttpException, HttpStatus } from '@nestjs/common';

export class FileValidationException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'File Validation Error',
        error: message
      },
      HttpStatus.BAD_REQUEST
    );
  }
} 