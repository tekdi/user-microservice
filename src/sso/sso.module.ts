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
import { Fields } from '../fields/entities/fields.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { PostgresModule } from '../adapters/postgres/postgres-module';
import { PostgresRoleService } from '../adapters/postgres/rbac/role-adapter';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import { PostgresAssignTenantService } from 'src/adapters/postgres/userTenantMapping-adapter';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import { User } from 'src/user/entities/user-entity';
import { Tenants } from 'src/userTenantMapping/entities/tenant.entity';
import { KafkaModule } from 'src/kafka/kafka.module';

@Module({
  imports: [
    UserModule,
    ConfigModule,
    HttpModule,
    PostgresModule, // This includes all the required services and entities
    KafkaModule, // Required for PostgresAssignTenantService dependency
    TypeOrmModule.forFeature([
      Role, 
      UserRoleMapping, 
      RolePrivilegeMapping,
      Fields,
      FieldValues,
      UserTenantMapping,
      User,
      Tenants
    ])
  ],
  controllers: [SsoController],
  providers: [
    SsoService, 
    HttpService,
    PostgresRoleService, // Added separately since not exported from PostgresModule
    PostgresFieldsService,
    PostgresAssignTenantService,
  ],
  exports: [SsoService]
})
export class SsoModule {}
