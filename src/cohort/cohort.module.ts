import { Module } from "@nestjs/common";
import { CohortController } from "./cohort.controller";
import { HttpModule } from "@nestjs/axios";
import { CohortAdapter } from "./cohortadapter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cohort } from "./entities/cohort.entity";
import { FieldsService } from "../fields/fields.service";
import { Fields } from "../fields/entities/fields.entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { PostgresCohortService } from "src/adapters/postgres/cohort-adapter";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { PostgresFieldsService } from "src/adapters/postgres/fields-adapter";
import { CohortAcademicYearService } from "src/adapters/postgres/cohortAcademicYear-adapter";
import { Role } from "src/rbac/role/entities/role.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";
import { User } from "src/user/entities/user-entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cohort,
      FieldValues,
      Fields,
      CohortMembers,
      UserTenantMapping,
      Role,
      CohortAcademicYear,
      AcademicYear,
      User,
    ]),
    HttpModule,
    PostgresModule,
  ],
  controllers: [CohortController],
  providers: [
    CohortAdapter,
    FieldsService,
    PostgresCohortService,
    PostgresFieldsService,
    CohortAcademicYearService,
    PostgresAcademicYearService,
    PostgresCohortMembersService,
  ],
})
export class CohortModule {}
