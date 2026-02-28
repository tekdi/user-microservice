import { Module } from "@nestjs/common";
import { CohortController } from "./cohort.controller";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cohort } from "./entities/cohort.entity";
import { FieldsService } from "../fields/fields.service";
import { Fields } from "../fields/entities/fields.entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { CohortService } from "./cohort.service";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { CohortAcademicYearService } from "src/cohortAcademicYear/cohortAcademicYear.service";
import { Role } from "src/rbac/role/entities/role.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { AcademicYearService } from "src/academicyears/academicyears.service";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { CohortMembersService } from "src/cohortMembers/cohortMembers.service";
import { User } from "src/user/entities/user-entity";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { KafkaService } from "../kafka/kafka.service";
import { FieldsModule } from "../fields/fields.module";
import { CohortMembersModule } from "../cohortMembers/cohortMembers.module";
import { CohortAcademicYearModule } from "../cohortAcademicYear/cohortAcademicYear.module";
import { AcademicyearsModule } from "../academicyears/academicyears.module";
import { KafkaModule } from "../kafka/kafka.module";


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
      Tenant,
      AutomaticMember
    ]),
    HttpModule,
    FieldsModule,
    CohortMembersModule,
    CohortAcademicYearModule,
    AcademicyearsModule,
    KafkaModule,
  ],
  controllers: [CohortController],
  providers: [
    CohortService,
    AutomaticMemberService,
  ],
  exports: [CohortService],
})
export class CohortModule { }
