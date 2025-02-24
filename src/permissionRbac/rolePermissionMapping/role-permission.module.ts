import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RolePermission } from "./entities/rolePermissionMapping";
import { RolePermissionMappingController } from "./role-permission-mapping.controller";
import { RolePermissionService } from "./role-permission-mapping.service";

@Module({
  imports: [TypeOrmModule.forFeature([RolePermission])],
  controllers: [RolePermissionMappingController],
  providers: [RolePermissionService],
  exports: [RolePermissionService],
})
export class RolePermissionModule {}
