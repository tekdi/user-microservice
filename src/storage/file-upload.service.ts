import { Injectable, Inject } from '@nestjs/common';
import { StorageConfigService } from './storage.config';
import { IFieldOperations } from './interfaces/field-operations.interface';
import { FileValidationException } from './exceptions/file-validation.exception';

@Injectable()
export class FileUploadService {
  // Convert MB to bytes
  private convertMBToBytes(mb: number): number {
    return mb * 1024 * 1024;
  }

  constructor(
    private readonly storageConfig: StorageConfigService,
    @Inject('FIELD_OPERATIONS')
    private readonly fieldOperations: IFieldOperations
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    fieldId: string,
    itemId: string
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
      
      // Validate file type
      if (fieldParams.allowedTypes && !fieldParams.allowedTypes.includes(file.mimetype)) {
        throw new FileValidationException(
          `File type not allowed. Allowed types: ${fieldParams.allowedTypes.join(', ')}`
        );
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

      // Upload file
      const storageProvider = this.storageConfig.getProvider();
      const filePath = await storageProvider.upload(file);
      const fileUrl = storageProvider.getUrl(filePath);

      // Save file value to FieldValues table
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
} 