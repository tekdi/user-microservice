import { Module } from "@nestjs/common";
import { AssignPrivilegeController } from "./assign-privilege.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { RolePrivilegeMapping } from "./entities/assign-privilege.entity";

@Module({
  imports: [TypeOrmModule.forFeature([RolePrivilegeMapping]), HttpModule],
  controllers: [AssignPrivilegeController],
  providers: [],
})
export class AssignPrivilegeModule {}
