import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './interfaces/storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';

/**
 * StorageConfigService
 *
 * Manages storage provider configuration and selection:
 * - Determines which storage provider to use (local or S3)
 * - Provides access to the configured storage provider
 * - Handles storage provider initialization and configuration
 */
@Injectable()
export class StorageConfigService {
  private readonly storageProvider: StorageProvider;

  /**
   * Initializes the storage configuration service.
   * - Determines storage provider from environment variables
   * - Initializes the appropriate storage provider (local or S3)
   * @param configService - NestJS ConfigService for environment access
   */
  constructor(private configService: ConfigService) {
    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'local');
    
    if (provider === 's3') {
      this.storageProvider = new S3StorageProvider(configService);
    } else {
      this.storageProvider = new LocalStorageProvider(configService);
    }
  }

  /**
   * Returns the configured storage provider.
   * @returns The storage provider instance (local or S3)
   */
  getProvider(): StorageProvider {
    return this.storageProvider;
  }
} 