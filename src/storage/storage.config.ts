import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './interfaces/storage.provider';

@Injectable()
export class StorageConfigService {
  constructor(
    private readonly configService: ConfigService,
    @Inject('STORAGE_PROVIDER')
    private readonly storageProvider: StorageProvider
  ) {}

  getProvider(): StorageProvider {
    return this.storageProvider;
  }
} 