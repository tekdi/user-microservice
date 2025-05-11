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
import { UserOrgTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { PostgresFieldsService } from "src/adapters/postgres/fields-adapter";
import { CohortAcademicYearService } from "src/adapters/postgres/cohortAcademicYear-adapter";
import { Role } from "src/rbac/role/entities/role.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";
import { User } from "src/user/entities/user-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";


@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cohort,
      FieldValues,
      Fields,
      CohortMembers,
      UserOrgTenantMapping,
      Role,
      CohortAcademicYear,
      AcademicYear,
      User,
      Tenants,
      AutomaticMember
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
    AutomaticMemberService
  ],
})
export class CohortModule { }
