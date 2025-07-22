import { Module,} from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AssignTenantController } from "./user-tenant-mapping.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserTenantMapping } from "./entities/user-tenant-mapping.entity";
import { AssignTenantAdapter } from "./user-tenant-mapping.adapter";
import { PostgresAssignTenantService } from "src/adapters/postgres/userTenantMapping-adapter";
import { User } from "src/user/entities/user-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserTenantMapping, User, Tenants]),
    HttpModule,
  ],
  controllers: [AssignTenantController],
  providers: [AssignTenantAdapter, PostgresAssignTenantService],
})
export class AssignTenantModule {}

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
