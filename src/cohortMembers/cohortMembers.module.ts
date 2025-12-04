import { Module, forwardRef } from "@nestjs/common";
import { CohortMembersController } from "./cohortMembers.controller";
import { HttpModule } from "@nestjs/axios";
import { CohortMembersService } from "./cohortMembers.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CohortMembers } from "./entities/cohort-member.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { User } from "src/user/entities/user-entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { KafkaModule } from "src/kafka/kafka.module";
import { FieldsModule } from "src/fields/fields.module";
import { UserModule } from "src/user/user.module";
import { AcademicyearsModule } from "src/academicyears/academicyears.module";
import { NotificationRequest } from "src/common/utils/notification.axios";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CohortMembers,
      Fields,
      User,
      Cohort,
      CohortAcademicYear,
      AcademicYear,
      Tenants,
    ]),
    HttpModule,
    FieldsModule,
    forwardRef(() => UserModule),
    AcademicyearsModule,
    KafkaModule,
  ],
  controllers: [CohortMembersController],
  providers: [CohortMembersService, NotificationRequest],
  exports: [CohortMembersService],
})
export class CohortMembersModule {}
