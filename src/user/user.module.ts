import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { HttpModule } from "@nestjs/axios";
import { UserService } from "./user.service";
import { FieldsModule } from "src/fields/fields.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user-entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UploadS3Service } from "src/common/services/upload-S3.service";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";
import { KafkaModule } from "src/kafka/kafka.module";
import { RoleModule } from "src/rbac/role/role.module";
import { AcademicyearsModule } from "src/academicyears/academicyears.module";
import { CohortAcademicYearModule } from "src/cohortAcademicYear/cohortAcademicYear.module";
import { NotificationRequest } from "src/common/utils/notification.axios";
import { JwtUtil } from "src/common/utils/jwt-token";
import { JwtModule } from "@nestjs/jwt";
import { AuthUtils } from "src/common/utils/auth-util";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      FieldValues,
      Fields,
      CohortMembers,
      UserTenantMapping,
      Tenant,
      UserRoleMapping,
      Cohort,
      Role,
      AutomaticMember,
    ]),
    HttpModule,
    JwtModule,
    FieldsModule,
    RoleModule,
    AcademicyearsModule,
    CohortAcademicYearModule,
    KafkaModule,
  ],
  controllers: [UserController],
  providers: [UserService, UploadS3Service, AutomaticMemberService, NotificationRequest, JwtUtil, AuthUtils],
  exports: [UserService], // Export UserService so it can be used in other modules
})
export class UserModule {}
