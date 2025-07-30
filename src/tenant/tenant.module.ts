import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { Tenant } from 'src/tenant/entities/tenent.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantConfigAudit } from './entities/tenant-config-audit.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesUploadService } from 'src/common/services/upload-file';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantConfig, TenantConfigAudit])
  ],
  controllers: [TenantController],
  providers: [TenantService, FilesUploadService]
})
export class TenantModule { }
