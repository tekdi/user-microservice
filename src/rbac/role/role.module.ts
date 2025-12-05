import { Module } from "@nestjs/common";
import { RoleController } from "./role.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Role } from "./entities/role.entity";
import { HttpModule } from "@nestjs/axios";
import { RoleService } from "./role.service";
import { UserRoleMapping } from "../assign-role/entities/assign-role.entity";
import { RolePrivilegeMapping } from "../assign-privilege/entities/assign-privilege.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, UserRoleMapping, RolePrivilegeMapping]),
    HttpModule,
  ],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
