import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageConfigService } from './storage.config';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { FileUploadService } from './file-upload.service';
import { FieldOperationsModule } from '../fields/field-operations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleMapping } from '../rbac/assign-role/entities/assign-role.entity';
import { Role } from '../rbac/role/entities/role.entity';

@Module({
  imports: [
    ConfigModule,
    FieldOperationsModule,
    TypeOrmModule.forFeature([UserRoleMapping, Role])
  ],
  providers: [
    StorageConfigService,
    {
      provide: 'STORAGE_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('STORAGE_PROVIDER');
        if (provider === 's3') {
          return new S3StorageProvider(configService);
        }
        return new LocalStorageProvider(configService);
      },
      inject: [ConfigService],
    },
    FileUploadService,
    {
      provide: 'STORAGE_CONFIG',
      useFactory: (configService: ConfigService) => ({
        provider: configService.get('STORAGE_PROVIDER', 'local'),
        local: {
          uploadDir: configService.get('STORAGE_LOCAL_UPLOAD_DIR', './uploads')
        },
        s3: {
          region: configService.get('AWS_REGION'),
          bucket: configService.get('AWS_BUCKET'),
          accessKeyId: configService.get('AWS_ACCESS_KEY_ID'),
          secretAccessKey: configService.get('AWS_SECRET_ACCESS_KEY')
        }
      }),
      inject: [ConfigService]
    }
  ],
  exports: [FileUploadService, StorageConfigService]
})
export class StorageModule {} 