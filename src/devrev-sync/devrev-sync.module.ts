import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DevRevClient } from "./devrev.client";
import { DevRevRecordService } from "./devrev-record.service";
import { DevRevSyncConfig } from "./devrev-sync.config";
import { DevRevSyncController } from "./devrev-sync.controller";
import { DevRevSyncQueue } from "./devrev-sync.queue";
import { DevRevSync } from "./entities/devrev-sync.entity";
import { LearnerSourceLoader } from "./learner-source.loader";
import { LearnerSyncService } from "./learner-sync.service";

/**
 * Syncs learner profiles and ALP cohort enrollments to DevRev.
 *
 * Global so the user and cohort-member adapters (provided by several modules)
 * can inject DevRevSyncQueue without each module importing this one.
 * Off unless DEVREV_SYNC_ENABLED=true; see README.md in this folder.
 */
@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DevRevSync])],
  controllers: [DevRevSyncController],
  providers: [
    DevRevSyncConfig,
    DevRevClient,
    DevRevRecordService,
    LearnerSourceLoader,
    LearnerSyncService,
    DevRevSyncQueue,
  ],
  exports: [DevRevSyncQueue],
})
export class DevRevSyncModule {}
