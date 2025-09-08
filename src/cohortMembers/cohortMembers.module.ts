import { Module } from "@nestjs/common";
import { CohortMembersController } from "./cohortMembers.controller";
import { HttpModule } from "@nestjs/axios";
import { CohortMembersAdapter } from "./cohortMembersadapter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CohortMembers } from "./entities/cohort-member.entity";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";
import { Fields } from "src/fields/entities/fields.entity";
import { User } from "src/user/entities/user-entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { KafkaModule } from "src/kafka/kafka.module";
import { PostgresCohortService } from "src/adapters/postgres/cohort-adapter";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { PostgresFieldsService } from "src/adapters/postgres/fields-adapter";
import { CohortAcademicYearService } from "src/adapters/postgres/cohortAcademicYear-adapter";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";

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
      FieldValues,
      UserTenantMapping,
      AutomaticMember
    ]),
    HttpModule,
    PostgresModule,
    KafkaModule,
  ],
  controllers: [CohortMembersController],
  providers: [
    CohortMembersAdapter,
    PostgresCohortMembersService,
    PostgresAcademicYearService,
    PostgresFieldsService,
    CohortAcademicYearService,
    AutomaticMemberService,
    PostgresCohortService,
  ],
  exports: [PostgresCohortMembersService]
})
export class CohortMembersModule { }
