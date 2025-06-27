import { Injectable, Inject } from '@nestjs/common';
import { StorageConfigService } from './storage.config';
import { IFieldOperations } from './interfaces/field-operations.interface';
import { FileValidationException } from './exceptions/file-validation.exception';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileTypeMapper } from '../utils/file-type-mapper';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleMapping } from '../rbac/assign-role/entities/assign-role.entity';
import { Role } from '../rbac/role/entities/role.entity';

/**
 * File Upload Service
 * 
 * This service handles all file upload and management operations including:
 * - Direct file uploads (local storage and S3)
 * - Presigned URL generation for S3 uploads
 * - File verification and cleanup
 * - File deletion with authorization
 * 
 * Supports multiple storage providers (Local and AWS S3) with automatic
 * user-specific folder creation and comprehensive validation.
 */
@Injectable()
export class FileUploadService {
  
  /**
   * Convert megabytes to bytes for file size validation
   * @param mb - Size in megabytes
   * @returns Size in bytes
   */
  private convertMBToBytes(mb: number): number {
    return mb * 1024 * 1024;
  }

  constructor(
    private readonly storageConfig: StorageConfigService,
    @Inject('FIELD_OPERATIONS')
    private readonly fieldOperations: IFieldOperations,
    @InjectRepository(UserRoleMapping)
    private userRoleMappingRepository: Repository<UserRoleMapping>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>
  ) {}

  /**
   * Get user role from database
   * @param userId - The user ID to get role for
   * @returns User role or null if not found
   */
  private async getUserRole(userId: string): Promise<string | null> {
    try {
      // Get user role mapping
      const userRoleMapping = await this.userRoleMappingRepository.findOne({
        where: { userId: userId }
      });

      if (!userRoleMapping) {
        return null;
      }

      // Get role details
      const role = await this.roleRepository.findOne({
        where: { roleId: userRoleMapping.roleId },
        select: ['title', 'code']
      });

      return role ? role.title : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Upload a file directly to storage (local or S3)
   * 
   * This method handles direct file uploads with comprehensive validation:
   * - Validates field configuration and type
   * - Checks file type against allowed types (supports both MIME types and extensions)
   * - Validates file size against configured limits
   * - Creates user-specific folders automatically
   * - Stores file URL and path in FieldValues table
   * 
   * @param file - The uploaded file from multer
   * @param fieldId - The field ID to associate the file with
   * @param itemId - The item ID (usually user ID) who owns the file
   * @param userId - Optional user ID for folder structure (defaults to itemId)
   * @returns Promise<string> - The public URL of the uploaded file
   * @throws FileValidationException - If validation fails
   */
  async uploadFile(
    file: Express.Multer.File,
    fieldId: string,
    itemId: string,
    userId?: string
  ): Promise<string> {
    try {
      // Get field configuration
      const field = await this.fieldOperations.getField(fieldId);
      if (!field) {
        throw new FileValidationException('Field not found');
      }
      
      if (field.type !== 'file') {
        throw new FileValidationException('Field is not a file type');
      }

      // Validate file
      const fieldParams = field.fieldParams as any;
      
      // Validate file type (robust: supports both extension and mimetype)
      if (fieldParams.allowedTypes) {
        const fileMimeType = file.mimetype.toLowerCase();
        const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

        const isAllowed = FileTypeMapper.isAllowedType(
          fileMimeType,
          fileExtension,
          fieldParams.allowedTypes
        );

        if (!isAllowed) {
          throw new FileValidationException(
            `File type not allowed. Allowed types: ${fieldParams.allowedTypes.join(', ')}`
          );
        }
      }

      // Validate file size
      if (fieldParams.maxSize) {
        const maxSizeInBytes = this.convertMBToBytes(fieldParams.maxSize);
        if (file.size > maxSizeInBytes) {
          throw new FileValidationException(
            `File size exceeds maximum allowed size of ${fieldParams.maxSize}MB`
          );
        }
      }

      // Upload file - use userId for folder structure if provided, otherwise use itemId
      const storageProvider = this.storageConfig.getProvider();
      const filePath = await storageProvider.upload(file, userId || itemId);
      const fileUrl = storageProvider.getUrl(filePath);

      // Save file value to FieldValues table using itemId
      await this.fieldOperations.updateFieldValue({
        fieldId,
        itemId,
        value: fileUrl,  // Store the URL as the value
        fileValue: filePath  // Store the path as fileValue
      });

      return fileUrl;
    } catch (error) {
      if (error instanceof FileValidationException) {
        throw error;
      }
      throw new FileValidationException('Failed to upload file: ' + error.message);
    }
  }

  /**
   * Verify an uploaded file in S3 storage.
   *
   * - Checks that the file exists and has the correct content type.
   * - Used after presigned URL upload to ensure file integrity.
   *
   * @param key - The S3 key of the file to verify
   * @param expectedContentType - The expected MIME type of the file
   * @returns True if verification passes
   * @throws FileValidationException if verification fails
   */
  public async verifyUpload(key: string, expectedContentType: string): Promise<boolean> {
    try {
      const storageProvider = this.storageConfig.getProvider();
      if (storageProvider instanceof S3StorageProvider) {
        // Use the getUrl method to get bucket info
        const bucketUrl = storageProvider.getUrl(key);
        const bucketMatch = bucketUrl.match(/https:\/\/(.*?)\.s3\./);
        const bucket = bucketMatch ? bucketMatch[1] : null;

        if (!bucket) {
          throw new FileValidationException('Failed to determine bucket from URL');
        }

        const headCommand = new HeadObjectCommand({
          Bucket: bucket,
          Key: key
        });
        
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
          }
        });

        const metadata = await s3Client.send(headCommand);
        
        // Verify the Content-Type matches what we expect
        if (metadata.ContentType !== expectedContentType) {
          throw new FileValidationException(
            `File type mismatch. Expected ${expectedContentType} but got ${metadata.ContentType}`
          );
        }
        
        return true;
      }
      return true; // For non-S3 providers, assume success
    } catch (error) {
      if (error instanceof FileValidationException) {
        throw error;
      }
      throw new FileValidationException('Failed to verify upload: ' + error.message);
    }
  }

  /**
   * Generate a presigned URL for S3 file upload.
   *
   * - Validates field and allowed file types.
   * - Generates a unique filename and user folder.
   * - Returns presigned URL, key, content type, and metadata.
   * - Optionally includes file data for step 2 upload.
   *
   * @param fieldId - The field ID to associate the file with
   * @param userId - The user ID for folder structure and authorization
   * @param fileType - Optional file type (e.g., 'pdf', 'jpg')
   * @param uploadedFile - Optional file data for step 2 uploads
   * @returns Presigned URL and metadata
   * @throws FileValidationException if validation fails
   */
  async getPresignedUrl(
    fieldId: string,
    userId: string,
    fileType?: string,
    uploadedFile?: Express.Multer.File
  ): Promise<{ 
    url: string; 
    key: string; 
    expiresIn: number; 
    "Content-Type": string; 
    metadata: any; 
    maxFileSize: number;
    binaryData?: Buffer;
    fileSize?: number;
    originalFileName?: string;
  }> {
    try {
      // Validate field and get field parameters
      const { field, fieldParams } = await this.validateField(fieldId);

      // Determine the file type to use
      const selectedFileType = this.determineFileType(fileType, fieldParams);

      // Get content type and extension
      const { contentType, fileExtension } = this.getContentTypeAndExtension(selectedFileType);

      // Generate dynamic filename
      const dynamicFileName = this.generateDynamicFileName(selectedFileType);

      // Get size limit in bytes
      const sizeLimit = fieldParams.maxSize ? this.convertMBToBytes(fieldParams.maxSize) : undefined;

      // Get presigned URL from storage provider
      const storageProvider = this.storageConfig.getProvider();
      const expiresIn = parseInt(process.env.AWS_UPLOAD_FILE_EXPIRY || '3600', 10);

      const result = await storageProvider.getPresignedUrl(
        dynamicFileName,
        contentType,
        userId,
        sizeLimit,
        {
          expiresIn,
          signableHeaders: new Set(['content-type'])
        }
      );

      // Prepare metadata
      const metadata = {
        fieldId,
        fieldName: field.name,
        fieldLabel: field.label,
        allowedTypes: fieldParams.allowedTypes,
        selectedFileType,
        maxSizeMB: fieldParams.maxSize,
        maxSizeBytes: sizeLimit || 0,
        generatedFileName: dynamicFileName,
        userId
      };

      return {
        url: result.url,
        key: result.key,
        expiresIn,
        "Content-Type": contentType,
        metadata,
        maxFileSize: sizeLimit || 0,
        binaryData: uploadedFile ? uploadedFile.buffer : undefined,
        fileSize: uploadedFile ? uploadedFile.size : undefined,
        originalFileName: uploadedFile ? uploadedFile.originalname : undefined
      };
    } catch (error) {
      if (error instanceof FileValidationException) {
        throw error;
      }
      throw new FileValidationException('Failed to generate presigned URL: ' + error.message);
    }
  }

  /**
   * Validate field existence and type, and return field parameters.
   * @param fieldId - The field ID to validate
   * @returns Field and field parameters
   * @throws FileValidationException if validation fails
   */
  private async validateField(fieldId: string): Promise<{ field: any; fieldParams: any }> {
    const field = await this.fieldOperations.getField(fieldId);
    if (!field) {
      throw new FileValidationException('Field not found');
    }

    if (field.type !== 'file') {
      throw new FileValidationException('Field is not a file type');
    }

    const fieldParams = field.fieldParams as any;
    if (!fieldParams || !fieldParams.allowedTypes) {
      throw new FileValidationException('Field parameters not configured properly');
    }

    return { field, fieldParams };
  }

  /**
   * Determine the file type to use based on input and allowed types.
   * @param fileType - Optional user-specified file type
   * @param fieldParams - Field parameters containing allowed types
   * @returns Selected file type
   * @throws FileValidationException if validation fails
   */
  private determineFileType(fileType: string | undefined, fieldParams: any): string {
    if (fileType) {
      // User specified a file type, validate it's allowed
      const normalizedFileType = fileType.toLowerCase();
      
      // Check if the file type is supported by our system
      const supportedTypes = FileTypeMapper.getSupportedExtensions();
      
      if (!supportedTypes.includes(normalizedFileType)) {
        throw new FileValidationException(
          `Failed to generate presigned URL, Allowed file types are [${fieldParams.allowedTypes.join(', ')}]`
        );
      }

      // Check if the file type is in the allowed types
      const isAllowed = FileTypeMapper.isAllowedType(
        '', // We don't have a MIME type here, just the file type
        normalizedFileType,
        fieldParams.allowedTypes
      );

      if (!isAllowed) {
        throw new FileValidationException(
          `Failed to generate presigned URL, Allowed file types are [${fieldParams.allowedTypes.join(', ')}]`
        );
      }
      
      return normalizedFileType;
    } else {
      // Use the first allowed type as default
      const firstAllowedType = fieldParams.allowedTypes[0].toLowerCase();
      return FileTypeMapper.mimeTypeToExtension(firstAllowedType);
    }
  }

  /**
   * Get content type and file extension for a given file type.
   * @param fileType - The file type to map
   * @returns Content type and file extension
   * @throws FileValidationException if file type is unsupported
   */
  private getContentTypeAndExtension(fileType: string): { contentType: string; fileExtension: string } {
    const mimeType = FileTypeMapper.getMimeType(fileType);
    if (!mimeType) {
      throw new FileValidationException(`Unsupported file type: ${fileType}`);
    }
    
    return {
      contentType: mimeType,
      fileExtension: `.${fileType}`
    };
  }

  /**
   * Generate a descriptive filename for uploaded files.
   *
   * - Creates unique, descriptive filenames based on file type.
   * - Uses UUID and timestamp for uniqueness.
   * - Adds a descriptive prefix (document, image, video, audio, file).
   *
   * @param fileType - The file type (e.g., 'pdf', 'jpg', 'mp4')
   * @returns Generated filename
   * @throws FileValidationException if file type is unsupported
   */
  private generateDynamicFileName(fileType: string): string {
    // Validate file type and get extension
    if (!FileTypeMapper.isSupportedType(fileType)) {
      throw new FileValidationException(`Unsupported file type: ${fileType}`);
    }
    
    const fileExtension = `.${fileType}`;

    // Generate a descriptive filename based on the file type
    const timestamp = Date.now();
    const uuid = uuidv4();
    
    // Get descriptive name from FileTypeMapper
    const descriptiveName = FileTypeMapper.getDescriptiveName(fileType);

    return `${descriptiveName}_${uuid}_${timestamp}${fileExtension}`;
  }

  /**
   * Delete a file with comprehensive authorization and validation.
   *
   * - Validates field and file record.
   * - Only allows deletion by file owner or admin.
   * - Verifies file exists in storage before deletion.
   * - Removes file from storage and database.
   *
   * Authorization Rules:
   * - Users can only delete files where fieldValue.itemId === userId (file owner)
   * - Admin users can delete any file regardless of ownership
   * - All other users are denied access
   *
   * @param fieldId - The field ID containing the file
   * @param userId - The user ID requesting deletion
   * @param userRole - Optional user role for admin authorization
   * @returns Deletion result with success status and metadata
   * @throws FileValidationException if validation or authorization fails
   */
  async deleteFile(
    fieldId: string,
    userId: string,
    userRole?: string
  ): Promise<{ success: boolean; message: string; deletedPath?: string }> {
    try {
      // Get field configuration
      const field = await this.fieldOperations.getField(fieldId);
      if (!field) {
        throw new FileValidationException('Field not found');
      }

      if (field.type !== 'file') {
        throw new FileValidationException('Field is not a file type');
      }

      // Get user role from database (preferred) or fallback to JWT token
      let actualUserRole = userRole;
      if (!actualUserRole) {
        actualUserRole = await this.getUserRole(userId);
      }

      // Get the field value to find the file path
      // itemId represents the user who owns the file, so we look for fieldValue where itemId = userId
      const fieldValue = await this.fieldOperations.getFieldValue(fieldId, userId);
      if (!fieldValue) {
        throw new FileValidationException('File not found for this field and user');
      }

      // Check if file path exists
      if (!fieldValue.fileValue) {
        throw new FileValidationException('File path not found in database');
      }

      // Extract S3 key from fileValue (fileValue might contain full URL or just the key)
      let s3Key = fieldValue.fileValue;
      
      // If fileValue contains a full URL, extract the key part
      if (fieldValue.fileValue.startsWith('http')) {
        try {
          const url = new URL(fieldValue.fileValue);
          // Remove the leading slash and get the path
          s3Key = url.pathname.substring(1);
        } catch (error) {
          throw new FileValidationException('Invalid file URL format');
        }
      }

      // Authorization check
      const fileOwnerId = fieldValue.itemId; // itemId is the userId who owns the file
      const isOwner = fileOwnerId === userId;
      const isAdmin = actualUserRole === 'Admin' || actualUserRole === 'admin' || 
                     actualUserRole === 'ADMIN' || actualUserRole?.toLowerCase() === 'admin';

      if (!isOwner && !isAdmin) {
        throw new FileValidationException('You are not authorized to delete this file. Only the file owner or admin can delete it.');
      }

      // Check if file exists in storage
      const storageProvider = this.storageConfig.getProvider();
      if (storageProvider instanceof S3StorageProvider) {
        const verification = await storageProvider.verifyFile(s3Key);
        if (!verification.exists) {
          throw new FileValidationException('File not found in storage');
        }
      }

      // Delete file from storage
      await storageProvider.delete(s3Key);

      // Delete from database
      await this.fieldOperations.deleteFieldValue(fieldId, userId);

      return {
        success: true,
        message: 'File deleted successfully',
        deletedPath: s3Key
      };

    } catch (error) {
      if (error instanceof FileValidationException) {
        throw error;
      }
      throw new FileValidationException('Failed to delete file: ' + error.message);
    }
  }

  /**
   * Download a file with comprehensive authorization and validation.
   *
   * - Validates field and file record.
   * - Only allows download by file owner or admin.
   * - Verifies file exists in storage before download.
   * - Returns file buffer and metadata for download.
   *
   * Authorization Rules:
   * - Users can only download files where fieldValue.itemId === userId (file owner)
   * - Admin users can download any file regardless of ownership
   * - All other users are denied access
   *
   * @param fieldId - The field ID containing the file
   * @param userId - The user ID requesting download
   * @param userRole - Optional user role for admin authorization
   * @returns File download result with buffer and metadata
   * @throws FileValidationException if validation or authorization fails
   */
  async downloadFile(
    fieldId: string,
    userId: string,
    userRole?: string
  ): Promise<{ buffer: Buffer; contentType: string; originalName: string; size: number }> {
    try {
      // Get field configuration
      const field = await this.fieldOperations.getField(fieldId);
      if (!field) {
        throw new FileValidationException('Field not found');
      }

      if (field.type !== 'file') {
        throw new FileValidationException('Field type is not valid');
      }

      // Get user role from database (preferred) or fallback to JWT token
      let actualUserRole = userRole;
      if (!actualUserRole) {
        actualUserRole = await this.getUserRole(userId);
      }

      // Check if user is admin - improved role detection
      const isAdmin = actualUserRole === 'Admin' || actualUserRole === 'admin' || 
                     actualUserRole === 'ADMIN' || actualUserRole?.toLowerCase() === 'admin';

      // Get the field value to find the file path
      let fieldValue;
      
      if (isAdmin) {
        // For admin users, get all field values for this fieldId and use the first one
        const fieldValues = await this.fieldOperations.getFieldValuesByFieldId(fieldId);
        
        if (fieldValues.length === 0) {
          throw new FileValidationException('Field values does not found for this field');
        }
        // Use the first field value found (admin can access any file for this field)
        fieldValue = fieldValues[0];
      } else {
        // For non-admin users, look for their own file
        fieldValue = await this.fieldOperations.getFieldValue(fieldId, userId);
        if (!fieldValue) {
          throw new FileValidationException('Field values does not found for this field and user');
        }
      }

      // Check if file path exists
      if (!fieldValue.fileValue) {
        throw new FileValidationException('File path not found in database');
      }

      // Authorization check for non-admin users
      if (!isAdmin) {
        const fileOwnerId = fieldValue.itemId; // itemId is the userId who owns the file
        const isOwner = fileOwnerId === userId;

        if (!isOwner) {
          throw new FileValidationException('You are not authorized to download this file. Only the file owner or admin can download it.');
        }
      }

      // Determine file path based on storage type
      let filePath = fieldValue.fileValue;
      
      // For S3, fileValue contains the S3 key
      // For local storage, fileValue contains the file path, fallback to value if not set
      if (!filePath && fieldValue.value) {
        filePath = fieldValue.value;
      }

      if (!filePath) {
        throw new FileValidationException('File path not found in database');
      }

      // Extract S3 key from filePath if it's a full URL
      let s3Key = filePath;
      if (filePath.startsWith('http')) {
        try {
          const url = new URL(filePath);
          // Remove the leading slash and get the path
          s3Key = url.pathname.substring(1);
        } catch (error) {
          throw new FileValidationException('Invalid file URL format');
        }
      }

      // Download file from storage
      const storageProvider = this.storageConfig.getProvider();
      const downloadResult = await storageProvider.download(s3Key);

      return downloadResult;

    } catch (error) {
      if (error instanceof FileValidationException) {
        throw error;
      }
      throw new FileValidationException('Failed to download file: ' + error.message);
    }
  }
} 