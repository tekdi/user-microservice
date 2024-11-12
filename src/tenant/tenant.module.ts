import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { Tenants } from 'src/tenant/entities/tenent.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesUploadService } from 'src/common/services/upload-file';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenants])
  ],
  controllers: [TenantController],
  providers: [TenantService, FilesUploadService]
})
export class TenantModule { }
