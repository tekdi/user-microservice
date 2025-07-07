import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../types/storage.types';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly uploadDir: string) {}

  async upload(file: Express.Multer.File): Promise<string> {
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(this.uploadDir, fileName);
    await fs.writeFile(filePath, file.buffer);
    return filePath;
  }

  async delete(path: string): Promise<void> {
    await fs.unlink(path);
  }

  getUrl(path: string): string {
    return path;
  }
}

@Injectable()
export class S3StorageProvider implements StorageProvider {
  constructor(
    public readonly s3Client: S3Client,
    public readonly bucket: string,
    private readonly region: string
  ) {}

  async upload(file: Express.Multer.File): Promise<string> {
    const fileName = `${Date.now()}-${file.originalname}`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype
    }));
    return fileName;
  }

  async delete(path: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path
    }));
  }

  getUrl(path: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${path}`;
  }
} 