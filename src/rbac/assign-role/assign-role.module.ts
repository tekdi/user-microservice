import { Module } from "@nestjs/common";
import { AssignRoleAdapter } from "./assign-role.apater";
import { AssignRoleController } from "./assign-role.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserRoleMapping } from "./entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { PostgresAssignroleService } from "src/adapters/postgres/rbac/assignrole-adapter";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [TypeOrmModule.forFeature([UserRoleMapping, Role]), HttpModule],
  controllers: [AssignRoleController],
  providers: [AssignRoleAdapter, PostgresAssignroleService],
})
export class AssignRoleModule {}
