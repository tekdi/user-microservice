import {
  ApiTags,
  ApiBody,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import {
  Controller,
  Post,
  Body,
  SerializeOptions,
  Req,
  Headers,
  UseGuards,
  Res,
  UseFilters,
  Get,
  Query,
  Param,
  UsePipes,
  ValidationPipe,
  Patch,
  Delete,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import {
  FieldsOptionsSearchDto,
  FieldsSearchDto,
} from './dto/fields-search.dto';
import { Request, Response } from 'express';
import { FieldsDto } from './dto/fields.dto';
import { FieldsUpdateDto } from './dto/fields-update.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FieldsAdapter } from './fieldsadapter';
import { FieldValuesDto } from './dto/field-values.dto';
import { FieldValuesSearchDto } from './dto/field-values-search.dto';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from 'src/common/utils/api-id.config';
import { FileUploadService } from 'src/storage/file-upload.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3StorageProvider } from 'src/storage/providers/s3-storage.provider';
import { StorageConfigService } from 'src/storage/storage.config';
import { FileValidationException } from '../storage/exceptions/file-validation.exception';
import APIResponse from 'src/common/responses/response';
import { API_RESPONSES } from 'src/common/utils/response.messages';
import { StorageProvider } from 'src/storage/interfaces/storage.provider';

// Extend Express Request type to include user
interface RequestWithUser extends Request {
  user?: {
    sub: string;
    userId: string;
    name: string;
    username: string;
    [key: string]: any;
  };
}

@ApiTags('Fields')
@Controller('fields')
export class FieldsController {
  constructor(
    private fieldsAdapter: FieldsAdapter,
    private readonly fileUploadService: FileUploadService,
    private readonly storageConfig: StorageConfigService
  ) {}

  //fields
  //create fields
  @Post('/create')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @UsePipes(new ValidationPipe())
  @ApiCreatedResponse({ description: 'Fields has been created successfully.' })
  @ApiBody({ type: FieldsDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  public async createFields(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsDto: FieldsDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .createFields(request, fieldsDto, response);
  }

  //create fields
  @Patch('/update/:fieldId')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Fields has been created successfully.' })
  @ApiBody({ type: FieldsUpdateDto })
  @UsePipes(new ValidationPipe())
  @ApiForbiddenResponse({ description: 'Forbidden' })
  public async updateFields(
    @Param('fieldId') fieldId: string,
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsUpdateDto: FieldsUpdateDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .updateFields(fieldId, request, fieldsUpdateDto, response);
  }

  //search
  @Post('/search')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Fields list.' })
  @ApiBody({ type: FieldsSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  public async searchFields(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsSearchDto: FieldsSearchDto,
    @Res() response: Response
  ) {
    const tenantid = headers['tenantid'];
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .searchFields(tenantid, request, fieldsSearchDto, response);
  }

  //field values
  //create fields values
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  @Post('/values/create')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({
    description: 'Fields Values has been created successfully.',
  })
  @ApiBody({ type: FieldValuesDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  public async createFieldValues(
    @Req() request: Request,
    @Body() fieldValuesDto: FieldValuesDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .createFieldValues(request, fieldValuesDto, response);
  }

  //search fields values
  @Post('/values/search')
  @ApiBasicAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Fields Values list.' })
  @ApiBody({ type: FieldValuesSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  public async searchFieldValues(
    @Req() request: Request,
    @Body() fieldValuesSearchDto: FieldValuesSearchDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .searchFieldValues(request, fieldValuesSearchDto, response);
  }

  //Get Field Option
  @Post('/options/read')
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Field Options list.' })
  @ApiBody({ type: FieldsOptionsSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  public async getFieldOptions(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsOptionsSearchDto: FieldsOptionsSearchDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .getFieldOptions(fieldsOptionsSearchDto, response);
  }

  //Delete Field Option
  @Delete('/options/delete/:fieldName')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Field Options Delete.' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiQuery({ name: 'context', required: null })
  @ApiQuery({ name: 'option', required: null })
  @ApiQuery({ name: 'contextType', required: null })
  public async deleteFieldOptions(
    @Headers() headers,
    @Req() request: Request,
    @Param('fieldName') fieldName: string,
    @Query('option') option: string | null = null,
    @Query('context') context: string | null = null,
    @Query('contextType') contextType: string | null = null,
    @Res() response: Response
  ) {
    const requiredData = {
      fieldName: fieldName || null,
      option: option || null,
      context: context || null,
      contextType: contextType || null,
    };
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .deleteFieldOptions(requiredData, response);
  }

  @Delete('/delete')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Delete field (soft or permanent).' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({ strategy: 'excludeAll' })
  @ApiQuery({ name: 'fieldId', required: false, type: String })
  @ApiQuery({ name: 'fieldName', required: false, type: String })
  @ApiQuery({
    name: 'softDelete',
    required: false,
    type: Boolean,
    description: 'true for soft delete (default), false for permanent delete',
  })
  public async deleteField(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Query('fieldId') fieldId?: string,
    @Query('fieldName') fieldName?: string,
    @Query('softDelete') softDelete?: string // no initializer here
  ) {
    const softDeleteValue = softDelete === undefined || softDelete === 'true'; // default true

    const requiredData = {
      fieldId: fieldId || null,
      fieldName: fieldName || null,
      softDelete: softDeleteValue,
    };

    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .deleteField(requiredData, response);
  }

  @Get('/formFields')
  @ApiCreatedResponse({ description: 'Form Data Fetch' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiQuery({ name: 'context', required: false })
  @ApiQuery({ name: 'contextType', required: false })
  public async getFormData(
    @Headers() headers,
    @Req() request: Request,
    @Query('context') context: string | null = null,
    @Query('contextType') contextType: string | null = null,
    @Res() response: Response
  ) {
    const requiredData = {
      context: context || false,
      contextType: contextType || false,
    };
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .getFormCustomField(requiredData, response);
  }

  @Post('upload/:fieldId')
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  async uploadFile(
    @Param('fieldId') fieldId: string,
    @Param('itemId') itemId: string,
    @Query('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response
  ) {
    try {
      const fileUrl = await this.fileUploadService.uploadFile(
        file,
        fieldId,
        itemId,
        userId
      );
      return APIResponse.success(
        response,
        APIID.FIELDVALUES_CREATE,
        { url: fileUrl },
        HttpStatus.CREATED,
        'File uploaded successfully'
      );
    } catch (error) {
      if (error instanceof FileValidationException) {
        // Prefer the detailed error from the exception's response property if available
        const errorResponse = error.getResponse() as any;
        const errorMsg =
          errorResponse && errorResponse.error
            ? errorResponse.error
            : error.message;
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          errorMsg,
          'File Validation Error',
          HttpStatus.BAD_REQUEST
        );
      }
      return APIResponse.error(
        response,
        APIID.FIELDVALUES_CREATE,
        'Failed to upload file: ' + error.message,
        API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('presigned-url/:fieldId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  async getPresignedUrl(
    @Param('fieldId') fieldId: string,
    @Query('fileType') fileType: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ) {
    try {
      // Always prefer userId from bearer token first
      const userId = request.user?.userId || request.user?.sub;
      if (!userId) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'User ID is required from authentication token.',
          'USER_ID_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      // Determine file type - either from query param or from uploaded file
      let detectedFileType: string | undefined;
      
      if (file) {
        // If file is uploaded, get type from file extension
        detectedFileType = file.originalname.split('.').pop()?.toLowerCase();
        if (!detectedFileType) {
          return APIResponse.error(
            response,
            APIID.FIELDVALUES_CREATE,
            'Could not determine file type from the uploaded file.',
            'INVALID_FILE',
            HttpStatus.BAD_REQUEST
          );
        }
      } else if (fileType && fileType !== 'undefined') {
        // If no file but fileType query param exists, use that
        detectedFileType = fileType;
      } else {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'Either upload a file or provide fileType query parameter.',
          'FILE_TYPE_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.fileUploadService.getPresignedUrl(
        fieldId,
        userId,
        detectedFileType,
        file
      );

      return APIResponse.success(
        response,
        APIID.FIELDVALUES_CREATE,
        result,
        HttpStatus.OK,
        'Presigned URL generated successfully'
      );
    } catch (error) {
      // Only log unexpected errors, not validation errors
      if (!(error instanceof FileValidationException)) {
        console.log('Error in FieldsController getPresignedUrl:', error);
      }
      
      // Custom error message for file type validation
      if (
        error instanceof FileValidationException &&
        error.message &&
        error.message.includes('Allowed file types are')
      ) {
        // Extract allowed types from error message
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          error.message,
          'File Validation Error',
          HttpStatus.BAD_REQUEST
        );
      }

      if (error instanceof FileValidationException) {
        // Prefer the detailed error from the exception's response property if available
        const errorResponse = error.getResponse() as any;
        const errorMsg =
          errorResponse && errorResponse.error
            ? errorResponse.error
            : error.message;
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          errorMsg,
          'File Validation Error',
          HttpStatus.BAD_REQUEST
        );
      }

      return APIResponse.error(
        response,
        APIID.FIELDVALUES_CREATE,
        'Failed to generate presigned URL',
        API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('verify-upload/:fieldId')
  @UseGuards(JwtAuthGuard)
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  async verifyUpload(
    @Param('fieldId') fieldId: string,
    @Body() body: { key: string; expectedContentType: string; expectedSize?: number },
    @Req() request: RequestWithUser,
    @Res() response: Response
  ) {
    try {
      // Extract userId from bearer token
      const userId = request.user?.userId || request.user?.sub;
      if (!userId) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'User ID is required from authentication token.',
          'USER_ID_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if using S3 storage provider
      const storageProvider = this.storageConfig.getProvider();
      if (!(storageProvider instanceof S3StorageProvider)) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'File verification and cleanup is only supported for S3 storage with presigned URL method.',
          'VERIFICATION_NOT_SUPPORTED',
          HttpStatus.BAD_REQUEST
        );
      }

      // Get the actual upload directory from the storage provider
      const uploadDir = (storageProvider as any).uploadDir || 'uploads';
      
      // Verify the file was uploaded via presigned URL (check if key contains expected path structure)
      if (!body.key || !body.key.includes(uploadDir)) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          `File verification is only supported for files uploaded via presigned URL method. Key must contain '${uploadDir}'.`,
          'INVALID_FILE_KEY',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await storageProvider.verifyAndCleanupFile(
        body.key,
        body.expectedContentType,
        body.expectedSize
      );

      if (result.valid) {
        return APIResponse.success(
          response,
          APIID.FIELDVALUES_CREATE,
          { 
            key: body.key, 
            status: 'valid',
            storageType: 'S3',
            method: 'presigned-url'
          },
          HttpStatus.OK,
          'File verification successful (S3 presigned URL method)'
        );
      } else {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          result.reason || 'FILE_VERIFICATION_FAILED',
          'File Verification Error (S3 presigned URL method)',
          result.deleted ? HttpStatus.OK : HttpStatus.BAD_REQUEST
        );
      }
    } catch (error) {
      return APIResponse.error(
        response,
        APIID.FIELDVALUES_CREATE,
        'Failed to verify upload: ' + error.message,
        API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload-complete/:fieldId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  async uploadComplete(
    @Param('fieldId') fieldId: string,
    @Query('fileType') fileType: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ) {
    try {
      // Always prefer userId from bearer token first
      const userId = request.user?.userId || request.user?.sub;
      if (!userId) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'User ID is required from authentication token.',
          'USER_ID_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      // Determine file type - either from query param or from uploaded file
      let detectedFileType: string | undefined;
      
      if (file) {
        // If file is uploaded, get type from file extension
        detectedFileType = file.originalname.split('.').pop()?.toLowerCase();
        if (!detectedFileType) {
          return APIResponse.error(
            response,
            APIID.FIELDVALUES_CREATE,
            'Could not determine file type from the uploaded file.',
            'INVALID_FILE',
            HttpStatus.BAD_REQUEST
          );
        }
      } else if (fileType && fileType !== 'undefined') {
        // If no file but fileType query param exists, use that
        detectedFileType = fileType;
      } else {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          'Either upload a file or provide fileType query parameter.',
          'FILE_TYPE_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      // Step 1: Generate presigned URL with file data
      const presignedResult = await this.fileUploadService.getPresignedUrl(
        fieldId,
        userId,
        detectedFileType,
        file
      );

      // Step 2: Upload to S3 using the presigned URL
      if (presignedResult.binaryData && presignedResult.fileSize) {
        const uploadResponse = await fetch(presignedResult.url, {
          method: 'PUT',
          headers: {
            'Content-Type': presignedResult["Content-Type"],
            'Content-Length': presignedResult.fileSize.toString()
          },
          body: presignedResult.binaryData
        });

        if (!uploadResponse.ok) {
          return APIResponse.error(
            response,
            APIID.FIELDVALUES_CREATE,
            `Failed to upload to S3: ${uploadResponse.status} ${uploadResponse.statusText}`,
            'S3_UPLOAD_FAILED',
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }
      }

      // Step 3: Verify the uploaded file
      const storageProvider = this.storageConfig.getProvider();
      if (storageProvider instanceof S3StorageProvider) {
        const verificationResult = await storageProvider.verifyAndCleanupFile(
          presignedResult.key,
          presignedResult["Content-Type"],
          presignedResult.fileSize
        );

        if (!verificationResult.valid) {
          return APIResponse.error(
            response,
            APIID.FIELDVALUES_CREATE,
            verificationResult.reason || 'File verification failed',
            'VERIFICATION_FAILED',
            verificationResult.deleted ? HttpStatus.OK : HttpStatus.BAD_REQUEST
          );
        }
      }

      // All steps completed successfully
      return APIResponse.success(
        response,
        APIID.FIELDVALUES_CREATE,
        {
          key: presignedResult.key,
          url: presignedResult.url,
          status: 'uploaded_and_verified',
          storageType: 'S3',
          method: 'complete_upload',
          fileSize: presignedResult.fileSize,
          originalFileName: presignedResult.originalFileName,
          contentType: presignedResult["Content-Type"]
        },
        HttpStatus.OK,
        'File uploaded and verified successfully'
      );

    } catch (error) {
      // Only log unexpected errors, not validation errors
      if (!(error instanceof FileValidationException)) {
        console.log('Error in FieldsController uploadComplete:', error);
      }
      
      if (error instanceof FileValidationException) {
        // Prefer the detailed error from the exception's response property if available
        const errorResponse = error.getResponse() as any;
        const errorMsg =
          errorResponse && errorResponse.error
            ? errorResponse.error
            : error.message;
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_CREATE,
          errorMsg,
          'File Validation Error',
          HttpStatus.BAD_REQUEST
        );
      }

      return APIResponse.error(
        response,
        APIID.FIELDVALUES_CREATE,
        'Failed to complete upload: ' + error.message,
        API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('delete-file/:fieldId')
  @UseGuards(JwtAuthGuard)
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_DELETE))
  async deleteFile(
    @Param('fieldId') fieldId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ) {
    try {
      // Extract userId and role from bearer token
      const userId = request.user?.userId || request.user?.sub;
      const userRole = request.user?.role || request.user?.realm_access?.roles?.[0];
      
      if (!userId) {
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_DELETE,
          'User ID is required from authentication token.',
          'USER_ID_REQUIRED',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.fileUploadService.deleteFile(
        fieldId,
        userId,
        userRole
      );

      return APIResponse.success(
        response,
        APIID.FIELDVALUES_DELETE,
        {
          fieldId,
          deletedPath: result.deletedPath,
          status: 'deleted',
          storageType: 'S3',
          method: 'delete-file'
        },
        HttpStatus.OK,
        result.message
      );

    } catch (error) {
      // Only log unexpected errors, not validation errors
      if (!(error instanceof FileValidationException)) {
        console.log('Error in FieldsController deleteFile:', error);
      }
      
      if (error instanceof FileValidationException) {
        // Prefer the detailed error from the exception's response property if available
        const errorResponse = error.getResponse() as any;
        const errorMsg =
          errorResponse && errorResponse.error
            ? errorResponse.error
            : error.message;
        return APIResponse.error(
          response,
          APIID.FIELDVALUES_DELETE,
          errorMsg,
          'File Deletion Error',
          HttpStatus.BAD_REQUEST
        );
      }

      return APIResponse.error(
        response,
        APIID.FIELDVALUES_DELETE,
        'Failed to delete file: ' + error.message,
        API_RESPONSES.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
