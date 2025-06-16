import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface StorageConfig {
  provider: 'local' | 's3';
  local?: {
    uploadDir: string;
  };
  s3?: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface StorageProvider {
  upload(file: Express.Multer.File): Promise<string>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
} 