import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "src/common/guards/keycloak.strategy";
import { RbacJwtStrategy } from "src/common/guards/rbac.strategy";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../user/entities/user-entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { KeycloakService } from "src/common/utils/keycloak.service";
import { RolePermissionModule } from "src/rolePermissionMapping/role-permission.module";
import { RolePermission } from "src/rolePermissionMapping/entities/rolePermissionMapping";
import { MagicLink } from "./entities/magic-link.entity";
import { UserModule } from "src/user/user.module";
import { NotificationRequest } from "@utils/notification.axios";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      FieldValues,
      Fields,
      CohortMembers,
      RolePermission,
      MagicLink
    ]),
    HttpModule,
    JwtModule,
    RolePermissionModule,
    UserModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RbacJwtStrategy,
    KeycloakService,
    NotificationRequest,
  ],
  exports: [AuthService]
})
export class AuthModule {}
