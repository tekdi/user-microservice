import { Module } from "@nestjs/common";
import { RoleController } from "./role.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Role } from "./entities/role.entity";
import { HasuraModule } from "src/adapters/hasura/hasura.module";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { PostgresRoleService } from "src/adapters/postgres/rbac/role-adapter";
import { HasuraRoleService } from "src/adapters/hasura/rbac/role.adapter";
import { HttpModule } from "@nestjs/axios";
import { RoleAdapter } from "./roleadapter";
import { UserRoleMapping } from "../assign-role/entities/assign-role.entity";
import { RolePrivilegeMapping } from "../assign-privilege/entities/assign-privilege.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, UserRoleMapping, RolePrivilegeMapping]),
    HttpModule,
    PostgresModule,
    HasuraModule,
  ],
  controllers: [RoleController],
  providers: [RoleAdapter, HasuraRoleService, PostgresRoleService],
})
export class RoleModule {}
