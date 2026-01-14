import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CronService } from "./cron.service";
import { CronController } from "./cron.controller";
import { UserModule } from "../user/user.module";
import { CohortModule } from "../cohort/cohort.module";
import { FieldsModule } from "../fields/fields.module";
import { CohortMembersModule } from "../cohortMembers/cohortMembers.module";
import { UserTenantMappingModule } from "../userTenantMapping/user-tenant-mapping.module";
import { KafkaModule } from "../kafka/kafka.module";
import { Cohort } from "../cohort/entities/cohort.entity";
import { CohortMembers } from "../cohortMembers/entities/cohort-member.entity";
import { CohortAcademicYear } from "../cohortAcademicYear/entities/cohortAcademicYear.entity";
import { UserTenantMapping } from "../userTenantMapping/entities/user-tenant-mapping.entity";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Cohort,
      CohortMembers,
      CohortAcademicYear,
      UserTenantMapping,
    ]),
    UserModule,
    CohortModule,
    FieldsModule,
    CohortMembersModule,
    UserTenantMappingModule,
    KafkaModule,
  ],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
