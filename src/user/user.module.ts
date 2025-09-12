import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { HttpModule } from "@nestjs/axios";
import { UserAdapter } from "./useradapter";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user-entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { CohortMembersModule } from "src/cohortMembers/cohortMembers.module";
import { UploadS3Service } from "src/common/services/upload-S3.service";
import { AutomaticMemberService } from "src/automatic-member/automatic-member.service";
import { AutomaticMember } from "src/automatic-member/entity/automatic-member.entity";
import { KafkaModule } from "src/kafka/kafka.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      FieldValues,
      Fields,
      CohortMembers,
      UserTenantMapping,
      Tenants,
      UserRoleMapping,
      Cohort,
      Role,
      AutomaticMember,
    ]),
    HttpModule,
    PostgresModule,
    CohortMembersModule,
    KafkaModule,
  ],
  controllers: [UserController],
  providers: [UserAdapter, UploadS3Service, AutomaticMemberService],
  exports: [UserAdapter], // Export UserAdapter so it can be used in other modules
})
export class UserModule {}
