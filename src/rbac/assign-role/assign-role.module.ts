import { Module } from "@nestjs/common";
import { AssignRoleService } from "./assign-role.service";
import { AssignRoleController } from "./assign-role.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserRoleMapping } from "./entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [TypeOrmModule.forFeature([UserRoleMapping, Role]), HttpModule],
  controllers: [AssignRoleController],
  providers: [AssignRoleService],
  exports: [AssignRoleService],
})
export class AssignRoleModule {}
