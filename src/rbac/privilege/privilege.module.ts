import { Module } from "@nestjs/common";
import { PrivilegeController } from "./privilege.controller";
import { Privilege } from "./entities/privilege.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { PrivilegeService } from "./privilege.service";
import { Role } from "../role/entities/role.entity";
import { Repository } from "typeorm";
import { RolePrivilegeMapping } from "../assign-privilege/entities/assign-privilege.entity";
import { UserRoleMapping } from "../assign-role/entities/assign-role.entity";
import { RoleModule } from "../role/role.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Privilege,
      Role,
      UserRoleMapping,
      RolePrivilegeMapping,
    ]),
    HttpModule,
    RoleModule,
  ],
  controllers: [PrivilegeController],
  providers: [PrivilegeService, Repository],
  exports: [PrivilegeService],
})
export class PrivilegeModule {}
