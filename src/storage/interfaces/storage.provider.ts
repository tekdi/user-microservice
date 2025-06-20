/**
 * StorageProvider Interface
 *
 * Defines the contract for storage providers (local and S3):
 * - File upload operations
 * - File deletion operations
 * - URL generation
 * - Presigned URL generation for direct uploads
 *
 * Implemented by LocalStorageProvider and S3StorageProvider.
 */
export interface StorageProvider {
  /**
   * Uploads a file to storage.
   * @param file - The file to upload
   * @param userId - Optional user ID for folder structure
   * @returns Promise resolving to the file path/key
   */
  upload(file: Express.Multer.File, userId?: string): Promise<string>;

  /**
   * Deletes a file from storage.
   * @param filePath - The file path/key to delete
   * @returns Promise that resolves when deletion is complete
   */
  delete(filePath: string): Promise<void>;

  /**
   * Returns the public URL for a file.
   * @param filePath - The file path/key
   * @returns The public URL for the file
   */
  getUrl(filePath: string): string;

  /**
   * Generates a presigned URL for direct file upload.
   * @param fileName - The name of the file
   * @param contentType - The MIME type
   * @param userId - Optional user ID for folder structure
   * @param sizeLimit - Optional size limit
   * @param options - Presigned URL options (expiry, headers, conditions)
   * @returns Promise resolving to presigned URL and file key
   */
  getPresignedUrl(
    fileName: string,
    contentType: string,
    userId?: string,
    sizeLimit?: number,
    options?: {
      expiresIn: number;
      signableHeaders?: Set<string>;
      conditions?: Array<Array<string | number>>;
    }
  ): Promise<{ url: string; key: string }>;
} 