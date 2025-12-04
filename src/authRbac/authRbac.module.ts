import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthRbacService } from "./authRbac.service";
import { AuthRbacController } from "./authRbac.controller";
import { UserModule } from "src/user/user.module";
import { RoleModule } from "src/rbac/role/role.module";
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
    RoleModule,
    UserModule,
  ],
  providers: [AuthRbacService],
  controllers: [AuthRbacController],
})
export class AuthRbacModule {}
