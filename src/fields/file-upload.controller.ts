import { Request, Response } from 'express';
import { FileUploadService } from '../storage/file-upload.service';
import APIResponse from '../common/responses/response';
import { APIID } from '../common/utils/api-id.config';
import { API_RESPONSES } from '../common/utils/response.messages';
import { HttpStatus, Get, Param, Query, Res, Controller } from '@nestjs/common';

/**
 * FileUploadController
 *
 * Handles file upload operations for fields:
 * - Generate presigned URLs for S3 uploads
 * - Upload files directly to storage
 * - Verify uploaded files
 *
 * This controller is part of the fields module since it handles
 * file uploads specifically for field values.
 */
@Controller('fields')
export class FileUploadController {
  constructor(private fileUploadService: FileUploadService) {}

  /**
   * Generate a presigned URL for S3 file upload.
   * @param req - Express request object
   * @param res - Express response object
   */
  @Get(':fieldId/presigned-url')
  async getPresignedUrl(
    @Param('fieldId') fieldId: string,
    @Query('userId') userId: string,
    @Query('fileType') fileType: string,
    @Res() res: Response
  ) {
    const apiId = APIID.FIELDVALUES_CREATE;
    try {
      if (!userId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'userId is required',
          HttpStatus.BAD_REQUEST
        );
      }

      // Only pass fileType if it's not undefined or empty string
      const fileTypeParam = fileType && fileType !== 'undefined' ? fileType : undefined;

      const result = await this.fileUploadService.getPresignedUrl(
        fieldId,
        userId,
        fileTypeParam
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        'Presigned URL generated successfully'
      );
    } catch (error) {
      console.error('Error getting presigned URL:', error);

      // Handle FileValidationException specifically
      if (error.message && (error.message.includes('not allowed') || error.message.includes('Unsupported file type'))) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          error.message,
          HttpStatus.BAD_REQUEST
        );
      }

      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to generate presigned URL',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Upload a file directly to storage.
   * @param req - Express request object
   * @param res - Express response object
   */
  async uploadFile(req: Request, res: Response) {
    const apiId = APIID.FIELDVALUES_CREATE;
    try {
      const { fieldId } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'userId is required',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!req.file) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'No file uploaded',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.fileUploadService.uploadFile(
        req.file,
        fieldId,
        userId as string,
        userId as string
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        'File uploaded successfully'
      );
    } catch (error) {
      console.error('Error uploading file:', error);
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Verify an uploaded file in storage.
   * @param key - The file key/path
   * @param contentType - The expected content type
   * @param response - Express response object
   */
  @Get('verify/:key')
  async verifyUpload(
    @Param('key') key: string,
    @Query('contentType') contentType: string,
    @Res() response: Response
  ) {
    const apiId = APIID.FIELDVALUES_CREATE;
    try {
      const result = await this.fileUploadService.verifyUpload(key, contentType);
      return APIResponse.success(
        response,
        apiId,
        { verified: result },
        HttpStatus.OK,
        'File upload verified successfully'
      );
    } catch (error) {
      console.error('Error verifying upload:', error);
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.BAD_REQUEST,
        error.message || 'Failed to verify upload',
        HttpStatus.BAD_REQUEST
      );
    }
  }
} 