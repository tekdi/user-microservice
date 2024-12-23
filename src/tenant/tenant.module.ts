import { Module } from "@nestjs/common";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesUploadService } from "src/common/services/upload-file";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "typeorm";
import { ServicesModule } from "src/services/services.module";

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), ServicesModule],
  controllers: [TenantController],
  providers: [TenantService, FilesUploadService],
})
export class TenantModule {}
