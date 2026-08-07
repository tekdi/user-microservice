import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RoleModule } from "./role/role.module";
import { PrivilegeModule } from "./privilege/privilege.module";
import { AssignRoleModule } from "./assign-role/assign-role.module";
import { AssignPrivilegeModule } from "./assign-privilege/assign-privilege.module";
import { RolePrivilegeMapping } from "./assign-privilege/entities/assign-privilege.entity";
import { UserRoleMapping } from "./assign-role/entities/assign-role.entity";
import { Privilege } from "./privilege/entities/privilege.entity";
import { PermissionRegistrySyncService } from "./permission-registry-sync.service";

@Module({
  imports: [
    RoleModule,
    PrivilegeModule,
    AssignRoleModule,
    AssignPrivilegeModule,
    TypeOrmModule.forFeature([Privilege]),
    UserRoleMapping,
    RolePrivilegeMapping,
  ],
  providers: [PermissionRegistrySyncService],
})
export class RbacModule {}
