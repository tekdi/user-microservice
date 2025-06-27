import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage.provider';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

/**
 * S3StorageProvider
 *
 * Handles all S3-specific file operations:
 * - Uploading files to S3
 * - Deleting files from S3
 * - Generating presigned URLs for direct S3 uploads
 * - Verifying file existence and metadata
 * - Ensuring user folder structure in S3
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly uploadDir: string;

  /**
   * Initializes the S3 client and configuration from environment variables.
   * @param configService - NestJS ConfigService for environment access
   */
  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      },
      // Add additional configuration for better reliability
      maxAttempts: 3,
      requestHandler: {
        httpOptions: {
          timeout: 30000, // 30 seconds
          connectTimeout: 10000, // 10 seconds
        }
      }
    });
    this.bucket = this.configService.get<string>('AWS_BUCKET');
    this.region = this.configService.get<string>('AWS_REGION');
    // Remove leading and trailing slashes to avoid double slashes
    this.uploadDir = this.configService.get<string>('AWS_STORAGE_UPLOAD_DIR')?.replace(/^\/|\/$/g, '') || 'uploads';
  }

  /**
   * Ensures the user folder exists in S3 by creating a folder marker if needed.
   * @param userId - The user ID for the folder
   */
  private async ensureUserFolderExists(userId: string): Promise<void> {
    if (!userId) return;
    const folderKey = `${this.uploadDir}/${userId}/`;
    try {
      // Try to check if folder exists by checking for a folder marker
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: folderKey,
        })
      );
    } catch (error) {
      // If folder doesn't exist, create it by uploading an empty folder marker
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: folderKey,
          Body: '',
        })
      );
    }
  }

  /**
   * Uploads a file to S3, placing it in a user-specific folder if userId is provided.
   * @param file - The file to upload
   * @param userId - Optional user ID for folder structure
   * @returns The S3 key of the uploaded file
   */
  async upload(file: Express.Multer.File, userId?: string): Promise<string> {
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    const fileName = `${uuidv4()}_${timestamp}${fileExtension}`;
    // Create the key with user folder if userId is provided
    let key: string;
    if (userId) {
      // Ensure user folder exists before uploading
      await this.ensureUserFolderExists(userId);
      key = `${this.uploadDir}/${userId}/${fileName}`;
    } else {
      key = `${this.uploadDir}/${fileName}`;
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: `attachment; filename="${file.originalname}"`,
      Metadata: {
        originalFileName: file.originalname,
        fileSize: file.size.toString(),
        uploadedAt: new Date().toISOString()
      }
    });
    await this.s3Client.send(command);
    return key;
  }

  /**
   * Deletes a file from S3 by key.
   * @param filePath - The S3 key of the file to delete
   */
  async delete(filePath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
    });
    await this.s3Client.send(command);
  }

  /**
   * Returns the public S3 URL for a given file key.
   * @param filePath - The S3 key
   * @returns The public URL
   */
  getUrl(filePath: string): string {
    // Remove any double slashes and ensure proper path format
    const cleanPath = filePath.replace(/\/+/g, '/').replace(/^\//, '');
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${cleanPath}`;
  }

  /**
   * Generates a presigned URL for uploading a file to S3.
   * - Ensures user folder exists
   * - Adds metadata for tracking
   * @param fileName - The name of the file
   * @param contentType - The MIME type
   * @param userId - Optional user ID for folder structure
   * @param sizeLimit - Optional size limit
   * @param options - Presigned URL options (expiry, headers)
   * @returns The presigned URL and S3 key
   */
  async getPresignedUrl(
    fileName: string,
    contentType: string,
    userId?: string,
    sizeLimit?: number,
    options?: {
      expiresIn: number;
      signableHeaders?: Set<string>;
    }
  ): Promise<{ url: string; key: string }> {
    const fileExtension = path.extname(fileName);
    const timestamp = Date.now();
    const uniqueFileName = `${uuidv4()}_${timestamp}${fileExtension}`;
    let key: string;
    if (userId) {
      await this.ensureUserFolderExists(userId);
      key = `${this.uploadDir}/${userId}/${uniqueFileName}`;
    } else {
      key = `${this.uploadDir}/${uniqueFileName}`;
    }
    // Create a pre-signed PUT command with minimal requirements
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        expectedContentType: contentType,
        userId: userId || '',
        timestamp: timestamp.toString(),
        originalFileName: fileName
      }
    });
    const expiresIn = options?.expiresIn || parseInt(this.configService.get<string>('AWS_UPLOAD_FILE_EXPIRY') || '3600', 10);
    // Generate pre-signed URL with only content-type as required header
    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn,
      signableHeaders: new Set(['content-type']),
    });
    return { 
      url,
      key,
    };
  }

  /**
   * Verifies if a file exists in S3 and optionally checks its content type.
   * @param key - The S3 key
   * @param expectedContentType - Optional expected MIME type
   * @returns Existence, content type, and size info
   */
  async verifyFile(key: string, expectedContentType?: string): Promise<{ exists: boolean; contentType?: string; size?: number; error?: string }> {
    try {
      // Log for debugging
      console.log('Verifying file with key:', key);
      console.log('Bucket:', this.bucket);
      console.log('Region:', this.region);
      
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      const result = await this.s3Client.send(command);
      
      console.log('File verification successful:', {
        exists: true,
        contentType: result.ContentType,
        size: result.ContentLength
      });
      
      return {
        exists: true,
        contentType: result.ContentType,
        size: result.ContentLength
      };
    } catch (error) {
      console.log('File verification failed:', {
        key,
        error: error.message,
        statusCode: error.$metadata?.httpStatusCode,
        errorCode: error.$metadata?.errorCode
      });
      
      // Handle specific error types
      if (error.$metadata?.httpStatusCode === 404) {
        return {
          exists: false,
          error: 'File not found'
        };
      }
      
      // Handle network/DNS errors
      if (error.message && (
        error.message.includes('EAI_AGAIN') || 
        error.message.includes('getaddrinfo') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('timeout')
      )) {
        console.log('Network/DNS error detected, attempting alternative verification...');
        // For network issues, we could implement a fallback verification
        // For now, return a more specific error
        return {
          exists: false,
          error: `Network connectivity issue: ${error.message}`
        };
      }
      
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Get the minimum file size from configuration.
   * @returns Minimum file size in bytes
   */
  private getMinFileSize(): number {
    return this.configService.get<number>('AWS_MIN_FILE_SIZE_BYTES') ?? 1;
  }

  /**
   * Verifies an uploaded file and deletes it if invalid (wrong type/size/corrupted).
   * @param key - The S3 key
   * @param expectedContentType - The expected MIME type
   * @param expectedSize - Optional expected file size
   * @param minimumFileSize - Optional minimum file size in bytes (defaults to config or 1 byte)
   * @returns Validation result and whether file was deleted
   */
  async verifyAndCleanupFile(
    key: string, 
    expectedContentType: string, 
    expectedSize?: number,
    minimumFileSize?: number
  ): Promise<{ valid: boolean; deleted: boolean; reason?: string }> {
    try {
      const verification = await this.verifyFile(key, expectedContentType);
      if (!verification.exists) {
        return { valid: false, deleted: false, reason: 'File not found' };
      }
      // Check content type
      if (verification.contentType !== expectedContentType) {
        console.log(`Content type mismatch for ${key}. Expected: ${expectedContentType}, Got: ${verification.contentType}. Deleting file.`);
        await this.delete(key);
        return { valid: false, deleted: true, reason: `Content type mismatch. Expected: ${expectedContentType}, Got: ${verification.contentType}` };
      }
      // Check file size if provided
      if (expectedSize && verification.size && verification.size !== expectedSize) {
        console.log(`File size mismatch for ${key}. Expected: ${expectedSize}, Got: ${verification.size}. Deleting file.`);
        await this.delete(key);
        return { valid: false, deleted: true, reason: `File size mismatch. Expected: ${expectedSize}, Got: ${verification.size}` };
      }
      
      // Get minimum file size from parameter, configuration, or use default
      const minSize = minimumFileSize ?? this.getMinFileSize();
      
      // Check if file is too small (likely corrupted or empty)
      if (verification.size !== undefined && verification.size < minSize) {
        console.log(`File too small for ${key}. Size: ${verification.size}, Minimum: ${minSize}. Deleting file.`);
        await this.delete(key);
        return { valid: false, deleted: true, reason: `File too small (${verification.size} bytes), minimum required: ${minSize} bytes` };
      }
      return { valid: true, deleted: false };
    } catch (error) {
      console.log(`Error verifying file ${key}:`, error);
      return { valid: false, deleted: false, reason: error.message };
    }
  }

  /**
   * Downloads a file from S3.
   * @param filePath - The S3 key of the file to download
   * @returns Promise resolving to file buffer and metadata
   */
  async download(filePath: string): Promise<{ buffer: Buffer; contentType: string; originalName: string; size: number }> {
    try {
      // First, get file metadata to check if it exists and get content type
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      });
      
      const headResult = await this.s3Client.send(headCommand);
      
      // Get the file content
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      });
      
      const getResult = await this.s3Client.send(getCommand);
      
      if (!getResult.Body) {
        throw new Error('File body is empty');
      }
      
      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = getResult.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      
      // Extract original filename from metadata or use the key
      const originalName = headResult.Metadata?.originalFileName || 
                          path.basename(filePath) || 
                          'downloaded-file';
      
      return {
        buffer,
        contentType: headResult.ContentType || 'application/octet-stream',
        originalName,
        size: buffer.length
      };
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new Error('File not found in S3');
      }
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }
} 