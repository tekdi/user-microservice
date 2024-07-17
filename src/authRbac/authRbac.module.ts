import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthRbacService } from "./authRbac.service";
import { AuthRbacController } from "./authRbac.controller";
import { UserAdapter } from "src/user/useradapter";
import { HasuraModule } from "src/adapters/hasura/hasura.module";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { PostgresRoleService } from "src/adapters/postgres/rbac/role-adapter";
import { Role } from "src/rbac/role/entities/role.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, UserRoleMapping, RolePrivilegeMapping]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        global: true,
        secret: configService.get<string>("RBAC_JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("RBAC_JWT_EXPIRES_IN"),
        },
      }),
      inject: [ConfigService],
    }),
    HasuraModule,
    PostgresModule,
  ],
  providers: [AuthRbacService, UserAdapter, PostgresRoleService],
  controllers: [AuthRbacController],
})
export class AuthRbacModule {}
