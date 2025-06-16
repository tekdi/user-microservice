import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage.provider';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly uploadDir: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET');
    this.region = this.configService.get<string>('AWS_REGION');
    this.uploadDir = this.configService.get<string>('AWS_STORAGE_UPLOAD_DIR') || 'uploads';
  }

  async upload(file: Express.Multer.File): Promise<string> {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const key = `${this.uploadDir}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);
    return key;
  }

  async delete(filePath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
    });

    await this.s3Client.send(command);
  }

  getUrl(filePath: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filePath}`;
  }

  async getPresignedUrl(fileName: string, contentType: string): Promise<string> {
    const fileExtension = path.extname(fileName);
    const key = `${this.uploadDir}/${uuidv4()}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
} 