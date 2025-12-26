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
import { FieldsModule } from '../fields/fields.module';
import { RoleModule } from '../rbac/role/role.module';
import { UserTenantMappingModule } from '../userTenantMapping/user-tenant-mapping.module';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import { User } from 'src/user/entities/user-entity';
import { Tenant } from 'src/tenant/entities/tenent.entity';
import { KafkaModule } from 'src/kafka/kafka.module';

@Module({
  imports: [
    UserModule,
    ConfigModule,
    HttpModule,
    FieldsModule,
    RoleModule,
    UserTenantMappingModule,
    KafkaModule,
    TypeOrmModule.forFeature([
      Role, 
      UserRoleMapping, 
      RolePrivilegeMapping,
      Fields,
      FieldValues,
      UserTenantMapping,
      User,
      Tenant
    ])
  ],
  controllers: [SsoController],
  providers: [
    SsoService, 
    HttpService,
  ],
  exports: [SsoService]
})
export class SsoModule {}
