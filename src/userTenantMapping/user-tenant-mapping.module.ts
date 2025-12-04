import { HttpModule, Module } from "@nestjs/common";
import { AssignTenantController } from "./user-tenant-mapping.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserTenantMapping } from "./entities/user-tenant-mapping.entity";
import { UserTenantMappingService } from "./user-tenant-mapping.service";
import { User } from "src/user/entities/user-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { KafkaModule } from "src/kafka/kafka.module";
import { UserModule } from "src/user/user.module";
import { FieldsModule } from "src/fields/fields.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserTenantMapping, 
      User, 
      Tenants,
      Role,
      UserRoleMapping,
    ]),
    UserModule,
    FieldsModule,
    KafkaModule,
    HttpModule,
  ],
  controllers: [AssignTenantController],
  providers: [UserTenantMappingService],
  exports: [UserTenantMappingService],
})
export class UserTenantMappingModule {}

// import { Module } from '@nestjs/common';
// import { AssignRoleAdapter } from './assign-role.apater';
// import { AssignRoleController } from './assign-role.controller';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { UserRoleMapping } from './entities/assign-role.entity';
// import { Role } from "src/rbac/role/entities/role.entity";
// import { PostgresAssignroleService } from 'src/adapters/postgres/rbac/assignrole-adapter';
// import { HasuraAssignRoleService } from 'src/adapters/hasura/rbac/assignrole.adapter';
// import { HttpModule } from '@nestjs/axios';

// @Module({
//   imports:[TypeOrmModule.forFeature([UserRoleMapping,Role]),HttpModule],
//   controllers: [AssignRoleController],
//   providers: [AssignRoleAdapter,HasuraAssignRoleService,PostgresAssignroleService]
// })
// export class AssignRoleModule {}
