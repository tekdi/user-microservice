import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage.provider';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * LocalStorageProvider
 *
 * Handles all local file system operations:
 * - Uploading files to local storage
 * - Deleting files from local storage
 * - Generating local file URLs
 * - Managing file paths and directories
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly uploadDir: string;

  /**
   * Initializes the local storage provider with upload directory.
   * @param configService - NestJS ConfigService for environment access
   */
  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('STORAGE_LOCAL_UPLOAD_DIR') || './uploads';
  }

  /**
   * Uploads a file to local storage.
   * - Creates unique filename with timestamp
   * - Writes file buffer to local filesystem
   * - Returns the local file path
   * @param file - The file to upload
   * @param userId - Optional user ID for folder structure
   * @param subpath - Optional subpath under upload dir (e.g. 'pathways')
   * @returns The local file path
   */
  async upload(file: Express.Multer.File, userId?: string, subpath?: string): Promise<string> {
    if (subpath !== undefined && subpath !== null) {
      const sanitized = String(subpath).replace(/^\/|\/$/g, '');
      if (sanitized.includes('..') || sanitized.includes(path.sep)) {
        throw new Error('Invalid subpath: path traversal and path separators are not allowed');
      }
    }
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    const fileName = `${uuidv4()}_${timestamp}${fileExtension}`;

    const baseDir = subpath ? path.join(this.uploadDir, String(subpath).replace(/^\/|\/$/g, '')) : this.uploadDir;
    const targetDir = userId ? path.join(baseDir, userId) : baseDir;
    await fs.promises.mkdir(targetDir, { recursive: true });

    const filePath = path.join(targetDir, fileName);
    await fs.promises.writeFile(filePath, file.buffer);
    return filePath;
  }

  /**
   * Deletes a file from local storage.
   * @param filePath - The local file path to delete
   */
  async delete(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
  }

  /**
   * Returns the local file URL for a given file path.
   * @param filePath - The local file path
   * @returns The local file URL
   */
  getUrl(filePath: string): string {
    // Remove any double slashes and ensure proper path format
    const cleanPath = filePath.replace(/\/+/g, '/').replace(/^\//, '');
    return `/${cleanPath}`;
  }

  /**
   * Generates a presigned URL for local file upload (not applicable for local storage).
   * @param fileName - The name of the file
   * @param contentType - The MIME type
   * @param userId - Optional user ID (not used in local storage)
   * @param sizeLimit - Optional size limit
   * @param options - Presigned URL options (not applicable for local storage)
   * @returns The local file path and a placeholder URL
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
    const filePath = path.join(this.uploadDir, uniqueFileName);
    return { 
      url: filePath,
      key: filePath,
    };
  }
} 