import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "src/common/guards/keycloak.strategy";
import { RbacJwtStrategy } from "src/common/guards/rbac.strategy";
import { UserAdapter } from "../user/useradapter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../user/entities/user-entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { KeycloakService } from "src/common/utils/keycloak.service";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { RolePermissionModule } from "src/permissionRbac/rolePermissionMapping/role-permission.module";
import { RolePermissionService } from "src/permissionRbac/rolePermissionMapping/role-permission-mapping.service";
import { RolePermission } from "src/permissionRbac/rolePermissionMapping/entities/rolePermissionMapping";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      FieldValues,
      Fields,
      CohortMembers,
      RolePermission,
    ]),
    HttpModule,
    PostgresModule,
    RolePermissionModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RbacJwtStrategy,
    KeycloakService,
    UserAdapter,
    RolePermissionService,
  ],
})
export class AuthModule {}
