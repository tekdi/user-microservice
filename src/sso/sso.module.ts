import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';
import { HttpService } from '../common/utils/http-service';
import { UserModule } from '../user/user.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../rbac/role/entities/role.entity';
import { UserRoleMapping } from '../rbac/assign-role/entities/assign-role.entity';
import { RolePrivilegeMapping } from '../rbac/assign-privilege/entities/assign-privilege.entity';
import { PostgresModule } from '../adapters/postgres/postgres-module';
import { PostgresRoleService } from '../adapters/postgres/rbac/role-adapter';

@Module({
  imports: [
    UserModule,
    ConfigModule,
    HttpModule,
    PostgresModule, // This includes all the required services and entities
    TypeOrmModule.forFeature([
      Role, 
      UserRoleMapping, 
      RolePrivilegeMapping
    ])
  ],
  controllers: [SsoController],
  providers: [
    SsoService, 
    HttpService,
    PostgresRoleService // Added separately since not exported from PostgresModule
  ],
  exports: [SsoService]
})
export class SsoModule {}
