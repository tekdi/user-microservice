import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage.provider';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
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
    this.uploadDir = this.configService.get<string>('AWS_STORAGE_UPLOAD_DIR')?.replace(/(^\/|\/$)/g, '') || 'uploads';
  }

  /**
   * Ensures the user folder exists in S3 by creating a folder marker if needed.
   * @param baseDir - Base directory (uploadDir or uploadDir/subpath)
   * @param userId - The user ID for the folder
   */
  private async ensureUserFolderExists(baseDir: string, userId: string): Promise<void> {
    if (!userId) return;
    const folderKey = `${baseDir}/${userId}/`;
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
   * @param subpath - Optional subpath under upload dir (e.g. 'pathways') so key is uploadDir/subpath/...
   * @returns The S3 key of the uploaded file
   */
  async upload(file: Express.Multer.File, userId?: string, subpath?: string): Promise<string> {
    if (subpath !== undefined && subpath !== null) {
      const sanitized = String(subpath).replace(/(^\/|\/$)/g, '');
      if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
        throw new Error('Invalid subpath: path traversal and path separators are not allowed');
      }
    }
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    const fileName = `${uuidv4()}_${timestamp}${fileExtension}`;
    // Base dir: uploadDir or uploadDir/subpath (e.g. /uploads/userservice/application-form/pathways)
    const baseDir = subpath
      ? `${this.uploadDir}/${String(subpath).replace(/(^\/|\/$)/g, '')}`.replace(/\/+/g, '/')
      : this.uploadDir;
    let key: string;
    if (userId) {
      await this.ensureUserFolderExists(baseDir, userId);
      key = `${baseDir}/${userId}/${fileName}`;
    } else {
      key = `${baseDir}/${fileName}`;
    }
    // Use Buffer so SDK knows length (avoids "Stream of unknown length" warning)
    const body = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    const contentLength = body.length;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentLength: contentLength,
      ContentType: file.mimetype,
      ContentDisposition: `attachment; filename="${file.originalname}"`,
      Metadata: {
        originalFileName: file.originalname,
        fileSize: String(contentLength),
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
      await this.ensureUserFolderExists(this.uploadDir, userId);
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
   * Generates presigned POST (form) for upload – same shape as LMS: { url, fields }.
   * Client POSTs form-data to url with fields + file. Use for pathway to match LMS response format.
   */
  async getPresignedPostForKey(
    key: string,
    contentType: string,
    options?: { expiresIn?: number; sizeLimit?: number },
  ): Promise<{ url: string; fields: Record<string, string> }> {
    const cleanKey = key.replace(/(^\/|\/$)/g, '').replace(/\/+/g, '/');
    const expiresIn = options?.expiresIn ?? parseInt(this.configService.get<string>('AWS_UPLOAD_FILE_EXPIRY') || '3600', 10);
    const sizeLimit = options?.sizeLimit ?? 5 * 1024 * 1024; // 5MB default
    const { url, fields } = await createPresignedPost(this.s3Client, {
      Bucket: this.bucket,
      Key: cleanKey,
      // Conditions: eq Content-Type and content-length-range (SDK union type is complex)
      Conditions: [
        ['eq', '$Content-Type', contentType],
        ['content-length-range', 0, sizeLimit],
      ] as Parameters<typeof createPresignedPost>[1]['Conditions'],
      Fields: { 'Content-Type': contentType },
      Expires: expiresIn,
    });
    const fieldsWithBucket: Record<string, string> = { ...fields, bucket: this.bucket };
    return { url, fields: fieldsWithBucket };
  }

  /**
   * Verifies if a file exists in S3 and optionally checks its content type.
   * @param key - The S3 key
   * @param expectedContentType - Optional expected MIME type
   * @returns Existence, content type, and size info
   */
  async verifyFile(key: string, expectedContentType?: string): Promise<{ exists: boolean; contentType?: string; size?: number; error?: string }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      const result = await this.s3Client.send(command);
      return {
        exists: true,
        contentType: result.ContentType,
        size: result.ContentLength
      };
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 404) {
        return { exists: false, error: 'File not found' };
      }
      if (error.message && (
        error.message.includes('EAI_AGAIN') ||
        error.message.includes('getaddrinfo') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('timeout')
      )) {
        return { exists: false, error: `Network connectivity issue: ${error.message}` };
      }
      return { exists: false, error: error.message };
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
      if (verification.contentType !== expectedContentType) {
        await this.delete(key);
        return { valid: false, deleted: true, reason: `Content type mismatch. Expected: ${expectedContentType}, Got: ${verification.contentType}` };
      }
      if (expectedSize && verification.size && verification.size !== expectedSize) {
        await this.delete(key);
        return { valid: false, deleted: true, reason: `File size mismatch. Expected: ${expectedSize}, Got: ${verification.size}` };
      }
      const minSize = minimumFileSize ?? this.getMinFileSize();
      if (verification.size !== undefined && verification.size < minSize) {
        await this.delete(key);
        return { valid: false, deleted: true, reason: `File too small (${verification.size} bytes), minimum required: ${minSize} bytes` };
      }
      return { valid: true, deleted: false };
    } catch (error) {
      return { valid: false, deleted: false, reason: error.message };
    }
  }
} 