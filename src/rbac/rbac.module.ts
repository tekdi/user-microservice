import { Module } from "@nestjs/common";
import { RoleModule } from "./role/role.module";
import { PrivilegeModule } from "./privilege/privilege.module";
import { AssignRoleModule } from "./assign-role/assign-role.module";
import { AssignPrivilegeModule } from "./assign-privilege/assign-privilege.module";
import { RolePrivilegeMapping } from "./assign-privilege/entities/assign-privilege.entity";
import { UserRoleMapping } from "./assign-role/entities/assign-role.entity";

@Module({
  imports: [
    RoleModule,
    PrivilegeModule,
    AssignRoleModule,
    AssignPrivilegeModule,
    UserRoleMapping,
    RolePrivilegeMapping,
  ],
})
export class RbacModule {}
