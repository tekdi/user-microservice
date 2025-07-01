import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { User } from '../user/entities/user-entity';
import { CohortMembers } from '../cohortMembers/entities/cohort-member.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { Fields } from '../fields/entities/fields.entity';
import { UserTenantMapping } from '../userTenantMapping/entities/user-tenant-mapping.entity';
import { Tenants } from '../userTenantMapping/entities/tenant.entity';
import { UserRoleMapping } from '../rbac/assign-role/entities/assign-role.entity';
import { Role } from '../rbac/role/entities/role.entity';
import { BulkImportController } from './controllers/bulk-import.controller';
import { BulkImportService } from './services/bulk-import.service';
import { NotificationRequest } from '../common/utils/notification.axios';
import { UserModule } from '../user/user.module';
import { CohortMembersModule } from '../cohortMembers/cohortMembers.module';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { PostgresModule } from '../adapters/postgres/postgres-module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CohortMembers,
      FieldValues,
      Fields,
      UserTenantMapping,
      Tenants,
      UserRoleMapping,
      Role,
    ]),
    UserModule,
    CohortMembersModule,
    ElasticsearchModule,
    PostgresModule,
    HttpModule,
  ],
  controllers: [BulkImportController],
  providers: [
    BulkImportService,
    NotificationRequest,
  ],
  exports: [BulkImportService],
})
export class BulkImportModule {} 