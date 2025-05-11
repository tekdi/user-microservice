import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { PostgresUserService } from "./user-adapter";
import { FieldsService } from "src/fields/fields.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user-entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { PostgresFieldsService } from "./fields-adapter";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { UserOrgTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { PostgresRoleService } from "./rbac/role-adapter";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { NotificationRequest } from "@utils/notification.axios";
import { JwtUtil } from "@utils/jwt-token";
import { JwtService } from "@nestjs/jwt";
import { PostgresAcademicYearService } from "./academicyears-adapter";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { CohortAcademicYearService } from "./cohortAcademicYear-adapter";
import { AuthUtils } from "@utils/auth-util";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";
import { KafkaModule } from "src/kafka/kafka.module";


@Module({
  imports: [
    HttpModule,
    KafkaModule,
    TypeOrmModule.forFeature([
      User,
      Fields,
      FieldValues,
      CohortMembers,
      Fields,
      Cohort,
      UserOrgTenantMapping,
      Tenants,
      UserRoleMapping,
      Role,
      RolePrivilegeMapping,
      CohortAcademicYear,
      AcademicYear,
      AutomaticMember,
      
    ]),
  ],
  providers: [
    PostgresUserService,
    PostgresFieldsService,
    PostgresRoleService,
    NotificationRequest,
    JwtUtil,
    JwtService,
    CohortAcademicYearService,
    PostgresAcademicYearService,
    AuthUtils,
    AutomaticMemberService,
  ],
  exports: [
    PostgresUserService,
    PostgresFieldsService,
    NotificationRequest,
    JwtUtil,
    JwtService,
    CohortAcademicYearService,
    PostgresAcademicYearService,
    AutomaticMemberService,
  ],
})
export class PostgresModule { }
