export interface StorageProvider {
  upload(file: Express.Multer.File): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): string;
  getPresignedUrl(fileName: string, contentType: string): Promise<string>;
} 