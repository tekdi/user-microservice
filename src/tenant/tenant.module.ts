import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { Tenant } from 'src/tenant/entities/tenent.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesUploadService } from 'src/common/services/upload-file';
import { KafkaService } from 'src/kafka/kafka.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant])
  ],
  controllers: [TenantController],
  providers: [TenantService, FilesUploadService,KafkaService]
})
export class TenantModule { }
