import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage.provider';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly uploadDir: string;

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('STORAGE_LOCAL_UPLOAD_DIR') || './uploads';
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: Express.Multer.File): Promise<string> {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadDir, fileName);

    await fs.promises.writeFile(filePath, file.buffer);
    return filePath;
  }

  async delete(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
  }

  getUrl(filePath: string): string {
    return `/${filePath}`;
  }

  async getPresignedUrl(fileName: string, contentType: string): Promise<string> {
    throw new Error('Presigned URLs are not supported for local storage');
  }
} 