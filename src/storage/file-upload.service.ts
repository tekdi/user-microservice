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
    private readonly fieldOperations: IFieldOperations
  ) {}

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
        const allowedTypes = (fieldParams.allowedTypes || []).map((t: string) => t.toLowerCase());
        const fileMimeType = file.mimetype.toLowerCase();
        const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

        const isAllowed = allowedTypes.some((allowedType: string) => {
          // Direct match with mimetype or extension
          if (allowedType === fileMimeType || allowedType === fileExtension) return true;

          // Map extension to mimetype
          if (allowedType === 'pdf' && fileMimeType === 'application/pdf') return true;
          if (allowedType === 'csv' && fileMimeType === 'text/csv') return true;
          if ((allowedType === 'jpg' || allowedType === 'jpeg') && fileMimeType === 'image/jpeg') return true;
          if (allowedType === 'png' && fileMimeType === 'image/png') return true;
          if (allowedType === 'docx' && fileMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
          if (allowedType === 'xlsx' && fileMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
          if (allowedType === 'txt' && fileMimeType === 'text/plain') return true;
          if (allowedType === 'mp3' && fileMimeType === 'audio/mpeg') return true;
          if (allowedType === 'mp4' && fileMimeType === 'video/mp4') return true;
          // Add more mappings as needed

          // Map mimetype to extension
          if (fileExtension === 'pdf' && allowedType === 'application/pdf') return true;
          if (fileExtension === 'csv' && allowedType === 'text/csv') return true;
          if ((fileExtension === 'jpg' || fileExtension === 'jpeg') && allowedType === 'image/jpeg') return true;
          if (fileExtension === 'png' && allowedType === 'image/png') return true;
          if (fileExtension === 'docx' && allowedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
          if (fileExtension === 'xlsx' && allowedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
          if (fileExtension === 'txt' && allowedType === 'text/plain') return true;
          if (fileExtension === 'mp3' && allowedType === 'audio/mpeg') return true;
          if (fileExtension === 'mp4' && allowedType === 'video/mp4') return true;
          // Add more mappings as needed

          return false;
        });

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
      // Get field configuration
      const field = await this.fieldOperations.getField(fieldId);
      if (!field) {
        throw new FileValidationException('Field not found');
      }

      if (field.type !== 'file') {
        throw new FileValidationException('Field is not a file type');
      }

      // Get field parameters
      const fieldParams = field.fieldParams as any;
      if (!fieldParams || !fieldParams.allowedTypes) {
        throw new FileValidationException('Field parameters not configured properly');
      }

      // Determine which file type to use
      let selectedFileType = '';
      if (fileType) {
        // User specified a file type, validate it's allowed
        const normalizedFileType = fileType.toLowerCase();
        
        // Check if the file type is supported by our system
        const supportedTypes = [
          // Documents
          'pdf', 'docx', 'xlsx', 'txt', 'doc', 'xls', 'ppt', 'pptx', 'csv',
          // Images
          'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
          // Videos
          'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp',
          // Audio
          'mp3', 'wav', 'aac', 'ogg', 'wma', 'flac', 'm4a', 'opus'
        ];
        
        if (!supportedTypes.includes(normalizedFileType)) {
          throw new FileValidationException(
            `Failed to generate presigned URL, Allowed file types are [${fieldParams.allowedTypes.join(', ')}]`
          );
        }

        // Check if the file type is in the allowed types
        // Handle both MIME types and simple extensions in allowedTypes
        const isAllowed = fieldParams.allowedTypes.some((allowedType: string) => {
          const normalizedAllowedType = allowedType.toLowerCase();
          
          // Direct match
          if (normalizedAllowedType === normalizedFileType) {
            return true;
          }
          
          // Handle MIME type to extension mapping
          // Documents
          if (normalizedFileType === 'pdf' && normalizedAllowedType === 'application/pdf') {
            return true;
          }
          if (normalizedFileType === 'docx' && 
              normalizedAllowedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return true;
          }
          if (normalizedFileType === 'xlsx' && 
              normalizedAllowedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            return true;
          }
          if (normalizedFileType === 'txt' && normalizedAllowedType === 'text/plain') {
            return true;
          }
          if (normalizedFileType === 'csv' && normalizedAllowedType === 'text/csv') {
            return true;
          }
          
          // Images
          if (normalizedFileType === 'png' && normalizedAllowedType === 'image/png') {
            return true;
          }
          if ((normalizedFileType === 'jpg' || normalizedFileType === 'jpeg') && 
              normalizedAllowedType === 'image/jpeg') {
            return true;
          }
          if (normalizedFileType === 'gif' && normalizedAllowedType === 'image/gif') {
            return true;
          }
          if (normalizedFileType === 'svg' && normalizedAllowedType === 'image/svg+xml') {
            return true;
          }
          if (normalizedFileType === 'webp' && normalizedAllowedType === 'image/webp') {
            return true;
          }
          
          // Videos
          if (normalizedFileType === 'mp4' && normalizedAllowedType === 'video/mp4') {
            return true;
          }
          if (normalizedFileType === 'avi' && normalizedAllowedType === 'video/x-msvideo') {
            return true;
          }
          if (normalizedFileType === 'mov' && normalizedAllowedType === 'video/quicktime') {
            return true;
          }
          if (normalizedFileType === 'wmv' && normalizedAllowedType === 'video/x-ms-wmv') {
            return true;
          }
          if (normalizedFileType === 'webm' && normalizedAllowedType === 'video/webm') {
            return true;
          }
          if (normalizedFileType === 'mkv' && normalizedAllowedType === 'video/x-matroska') {
            return true;
          }
          if (normalizedFileType === '3gp' && normalizedAllowedType === 'video/3gpp') {
            return true;
          }
          
          // Audio
          if (normalizedFileType === 'mp3' && normalizedAllowedType === 'audio/mpeg') {
            return true;
          }
          if (normalizedFileType === 'wav' && normalizedAllowedType === 'audio/wav') {
            return true;
          }
          if (normalizedFileType === 'aac' && normalizedAllowedType === 'audio/aac') {
            return true;
          }
          if (normalizedFileType === 'ogg' && normalizedAllowedType === 'audio/ogg') {
            return true;
          }
          if (normalizedFileType === 'wma' && normalizedAllowedType === 'audio/x-ms-wma') {
            return true;
          }
          if (normalizedFileType === 'flac' && normalizedAllowedType === 'audio/flac') {
            return true;
          }
          if (normalizedFileType === 'm4a' && normalizedAllowedType === 'audio/mp4') {
            return true;
          }
          if (normalizedFileType === 'opus' && normalizedAllowedType === 'audio/opus') {
            return true;
          }
          
          return false;
        });

        if (!isAllowed) {
          throw new FileValidationException(
            `Failed to generate presigned URL, Allowed file types are [${fieldParams.allowedTypes.join(', ')}]`
          );
        }
        
        selectedFileType = normalizedFileType;
      } else {
        // Use the first allowed type as default
        // Convert MIME type to simple extension if needed
        const firstAllowedType = fieldParams.allowedTypes[0].toLowerCase();
        
        // Map MIME types to simple extensions for default selection
        // Documents
        if (firstAllowedType === 'application/pdf') {
          selectedFileType = 'pdf';
        } else if (firstAllowedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          selectedFileType = 'docx';
        } else if (firstAllowedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          selectedFileType = 'xlsx';
        } else if (firstAllowedType === 'text/plain') {
          selectedFileType = 'txt';
        } else if (firstAllowedType === 'text/csv') {
          selectedFileType = 'csv';
        }
        // Images
        else if (firstAllowedType === 'image/png') {
          selectedFileType = 'png';
        } else if (firstAllowedType === 'image/jpeg') {
          selectedFileType = 'jpg';
        } else if (firstAllowedType === 'image/gif') {
          selectedFileType = 'gif';
        } else if (firstAllowedType === 'image/svg+xml') {
          selectedFileType = 'svg';
        } else if (firstAllowedType === 'image/webp') {
          selectedFileType = 'webp';
        }
        // Videos
        else if (firstAllowedType === 'video/mp4') {
          selectedFileType = 'mp4';
        } else if (firstAllowedType === 'video/x-msvideo') {
          selectedFileType = 'avi';
        } else if (firstAllowedType === 'video/quicktime') {
          selectedFileType = 'mov';
        } else if (firstAllowedType === 'video/x-ms-wmv') {
          selectedFileType = 'wmv';
        } else if (firstAllowedType === 'video/webm') {
          selectedFileType = 'webm';
        } else if (firstAllowedType === 'video/x-matroska') {
          selectedFileType = 'mkv';
        } else if (firstAllowedType === 'video/3gpp') {
          selectedFileType = '3gp';
        }
        // Audio
        else if (firstAllowedType === 'audio/mpeg') {
          selectedFileType = 'mp3';
        } else if (firstAllowedType === 'audio/wav') {
          selectedFileType = 'wav';
        } else if (firstAllowedType === 'audio/aac') {
          selectedFileType = 'aac';
        } else if (firstAllowedType === 'audio/ogg') {
          selectedFileType = 'ogg';
        } else if (firstAllowedType === 'audio/x-ms-wma') {
          selectedFileType = 'wma';
        } else if (firstAllowedType === 'audio/flac') {
          selectedFileType = 'flac';
        } else if (firstAllowedType === 'audio/mp4') {
          selectedFileType = 'm4a';
        } else if (firstAllowedType === 'audio/opus') {
          selectedFileType = 'opus';
        } else {
          // Assume it's already a simple extension
          selectedFileType = firstAllowedType;
        }
      }

      let contentType = '';
      let fileExtension = '';
      
      // Map simple extensions to content types and file extensions
      switch (selectedFileType) {
        // Documents
        case 'pdf':
          contentType = 'application/pdf';
          fileExtension = '.pdf';
          break;
        case 'docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          fileExtension = '.docx';
          break;
        case 'xlsx':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          fileExtension = '.xlsx';
          break;
        case 'txt':
          contentType = 'text/plain';
          fileExtension = '.txt';
          break;
        case 'csv':
          contentType = 'text/csv';
          fileExtension = '.csv';
          break;
        case 'doc':
          contentType = 'application/msword';
          fileExtension = '.doc';
          break;
        case 'xls':
          contentType = 'application/vnd.ms-excel';
          fileExtension = '.xls';
          break;
        case 'ppt':
          contentType = 'application/vnd.ms-powerpoint';
          fileExtension = '.ppt';
          break;
        case 'pptx':
          contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          fileExtension = '.pptx';
          break;
        
        // Images
        case 'jpg':
        case 'jpeg':
          contentType = 'image/jpeg';
          fileExtension = '.jpg';
          break;
        case 'png':
          contentType = 'image/png';
          fileExtension = '.png';
          break;
        case 'gif':
          contentType = 'image/gif';
          fileExtension = '.gif';
          break;
        case 'bmp':
          contentType = 'image/bmp';
          fileExtension = '.bmp';
          break;
        case 'svg':
          contentType = 'image/svg+xml';
          fileExtension = '.svg';
          break;
        case 'webp':
          contentType = 'image/webp';
          fileExtension = '.webp';
          break;
        
        // Videos
        case 'mp4':
          contentType = 'video/mp4';
          fileExtension = '.mp4';
          break;
        case 'avi':
          contentType = 'video/x-msvideo';
          fileExtension = '.avi';
          break;
        case 'mov':
          contentType = 'video/quicktime';
          fileExtension = '.mov';
          break;
        case 'wmv':
          contentType = 'video/x-ms-wmv';
          fileExtension = '.wmv';
          break;
        case 'flv':
          contentType = 'video/x-flv';
          fileExtension = '.flv';
          break;
        case 'webm':
          contentType = 'video/webm';
          fileExtension = '.webm';
          break;
        case 'mkv':
          contentType = 'video/x-matroska';
          fileExtension = '.mkv';
          break;
        case 'm4v':
          contentType = 'video/x-m4v';
          fileExtension = '.m4v';
          break;
        case '3gp':
          contentType = 'video/3gpp';
          fileExtension = '.3gp';
          break;
        
        // Audio
        case 'mp3':
          contentType = 'audio/mpeg';
          fileExtension = '.mp3';
          break;
        case 'wav':
          contentType = 'audio/wav';
          fileExtension = '.wav';
          break;
        case 'aac':
          contentType = 'audio/aac';
          fileExtension = '.aac';
          break;
        case 'ogg':
          contentType = 'audio/ogg';
          fileExtension = '.ogg';
          break;
        case 'wma':
          contentType = 'audio/x-ms-wma';
          fileExtension = '.wma';
          break;
        case 'flac':
          contentType = 'audio/flac';
          fileExtension = '.flac';
          break;
        case 'm4a':
          contentType = 'audio/mp4';
          fileExtension = '.m4a';
          break;
        case 'opus':
          contentType = 'audio/opus';
          fileExtension = '.opus';
          break;
        
        default:
          throw new FileValidationException(`Unsupported file type: ${selectedFileType}`);
      }

      // Generate dynamic filename based on selected file type
      const dynamicFileName = this.generateDynamicFileName(selectedFileType);

      // Get size limit in bytes
      const sizeLimit = fieldParams.maxSize ? this.convertMBToBytes(fieldParams.maxSize) : undefined;

      // Get presigned URL from storage provider
      const storageProvider = this.storageConfig.getProvider();
      
      // Get expiry time from environment variable or default to 1 hour
      const expiresIn = parseInt(process.env.AWS_UPLOAD_FILE_EXPIRY || '3600', 10);

      // Generate presigned URL with conditions
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

      // Prepare metadata with clear instructions
      const metadata = {
        fieldId,
        fieldName: field.name,
        fieldLabel: field.label,
        allowedTypes: fieldParams.allowedTypes,
        selectedFileType: selectedFileType,
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
    let fileExtension = '';
    
    // Map simple extensions to file extensions
    switch (fileType) {
      // Documents
      case 'pdf':
        fileExtension = '.pdf';
        break;
      case 'docx':
        fileExtension = '.docx';
        break;
      case 'xlsx':
        fileExtension = '.xlsx';
        break;
      case 'txt':
        fileExtension = '.txt';
        break;
      case 'csv':
        fileExtension = '.csv';
        break;
      case 'doc':
        fileExtension = '.doc';
        break;
      case 'xls':
        fileExtension = '.xls';
        break;
      case 'ppt':
        fileExtension = '.ppt';
        break;
      case 'pptx':
        fileExtension = '.pptx';
        break;
      
      // Images
      case 'jpg':
      case 'jpeg':
        fileExtension = '.jpg';
        break;
      case 'png':
        fileExtension = '.png';
        break;
      case 'gif':
        fileExtension = '.gif';
        break;
      case 'bmp':
        fileExtension = '.bmp';
        break;
      case 'svg':
        fileExtension = '.svg';
        break;
      case 'webp':
        fileExtension = '.webp';
        break;
      
      // Videos
      case 'mp4':
        fileExtension = '.mp4';
        break;
      case 'avi':
        fileExtension = '.avi';
        break;
      case 'mov':
        fileExtension = '.mov';
        break;
      case 'wmv':
        fileExtension = '.wmv';
        break;
      case 'flv':
        fileExtension = '.flv';
        break;
      case 'webm':
        fileExtension = '.webm';
        break;
      case 'mkv':
        fileExtension = '.mkv';
        break;
      case 'm4v':
        fileExtension = '.m4v';
        break;
      case '3gp':
        fileExtension = '.3gp';
        break;
      
      // Audio
      case 'mp3':
        fileExtension = '.mp3';
        break;
      case 'wav':
        fileExtension = '.wav';
        break;
      case 'aac':
        fileExtension = '.aac';
        break;
      case 'ogg':
        fileExtension = '.ogg';
        break;
      case 'wma':
        fileExtension = '.wma';
        break;
      case 'flac':
        fileExtension = '.flac';
        break;
      case 'm4a':
        fileExtension = '.m4a';
        break;
      case 'opus':
        fileExtension = '.opus';
        break;
      
      default:
        throw new FileValidationException(`Unsupported file type: ${fileType}`);
    }

    // Generate a descriptive filename based on the file type
    const timestamp = Date.now();
    const uuid = uuidv4();
    
    // Create a descriptive name based on file type
    let descriptiveName = 'file';
    
    // Documents
    if (['pdf', 'docx', 'doc', 'txt'].includes(fileType)) {
      descriptiveName = 'document';
    } else if (['xlsx', 'xls', 'csv'].includes(fileType)) {
      descriptiveName = 'spreadsheet';
    } else if (['ppt', 'pptx'].includes(fileType)) {
      descriptiveName = 'presentation';
    }
    // Images
    else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(fileType)) {
      descriptiveName = 'image';
    }
    // Videos
    else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp'].includes(fileType)) {
      descriptiveName = 'video';
    }
    // Audio
    else if (['mp3', 'wav', 'aac', 'ogg', 'wma', 'flac', 'm4a', 'opus'].includes(fileType)) {
      descriptiveName = 'audio';
    }

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
          
          // Log for debugging
          console.log('Original fileValue:', fieldValue.fileValue);
          console.log('Extracted S3 key:', s3Key);
          
        } catch (error) {
          throw new FileValidationException('Invalid file URL format');
        }
      }

      // Authorization check
      const fileOwnerId = fieldValue.itemId; // itemId is the userId who owns the file
      const isOwner = fileOwnerId === userId;
      const isAdmin = userRole === 'Admin' || userRole === 'admin';

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
} 