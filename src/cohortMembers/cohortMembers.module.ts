import { Module, forwardRef } from '@nestjs/common';
import { CohortMembersController } from './cohortMembers.controller';
import { HttpModule } from '@nestjs/axios';
import { CohortMembersAdapter } from './cohortMembersadapter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CohortMembers } from './entities/cohort-member.entity';
import { PostgresModule } from 'src/adapters/postgres/postgres-module';
import { PostgresCohortMembersService } from 'src/adapters/postgres/cohortMembers-adapter';
import { Fields } from 'src/fields/entities/fields.entity';
import { FieldValues } from 'src/fields/entities/fields-values.entity';
import { User } from 'src/user/entities/user-entity';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import { CohortAcademicYear } from 'src/cohortAcademicYear/entities/cohortAcademicYear.entity';
import { PostgresAcademicYearService } from 'src/adapters/postgres/academicyears-adapter';
import { AcademicYear } from 'src/academicyears/entities/academicyears-entity';
import { Tenants } from 'src/userTenantMapping/entities/tenant.entity';
import { UserRoleMapping } from 'src/rbac/assign-role/entities/assign-role.entity';
import { Role } from 'src/rbac/role/entities/role.entity';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import { RolePrivilegeMapping } from 'src/rbac/assign-privilege/entities/assign-privilege.entity';
import { ElasticsearchModule } from 'src/elasticsearch/elasticsearch.module';
import { FormsModule } from 'src/forms/forms.module';
import { CohortMembersCronService } from './cohortMembers-cron.service';
import { PostgresRoleService } from 'src/adapters/postgres/rbac/role-adapter';
import { JwtUtil } from '@utils/jwt-token';
import { ConfigService } from '@nestjs/config';
import { CohortAcademicYearService } from 'src/adapters/postgres/cohortAcademicYear-adapter';
import { AuthUtils } from '@utils/auth-util';
import { NotificationRequest } from '@utils/notification.axios';
import { ConfigModule } from '@nestjs/config';

/**
 * Cohort Members Module
 *
 * This module provides comprehensive functionality for managing cohort members,
 * including CRUD operations, search capabilities, and automated shortlisting evaluation.
 *
 * Key Features:
 * - Cohort member creation, reading, updating, and deletion
 * - Advanced search with filtering and pagination
 * - Bulk operations for multiple cohort members
 * - Application form integration
 * - Automated shortlisting evaluation with cron jobs
 * - High-performance parallel processing for large datasets
 *
 * Dependencies:
 * - TypeORM for database operations
 * - HTTP module for external API calls (notifications)
 * - Forms module for form-related operations
 * - Postgres module for database adapter
 *
 * Database Entities:
 * - CohortMembers: Core cohort membership data
 * - Fields: Custom field definitions
 * - FieldValues: User-submitted field values
 * - User: User account information
 * - Cohort: Cohort definitions
 * - CohortAcademicYear: Cohort-academic year mappings
 * - AcademicYear: Academic year definitions
 * - Tenants: Multi-tenant support
 */
@Module({
  imports: [
    // TypeORM entities for database operations
    TypeOrmModule.forFeature([
      CohortMembers, // Core cohort membership entity
      Fields, // Custom field definitions
      FieldValues, // User-submitted field values (critical for shortlisting evaluation)
      User, // User account information
      Cohort, // Cohort definitions
      CohortAcademicYear, // Cohort-academic year mappings
      AcademicYear, // Academic year definitions
      Tenants, // Multi-tenant support
      UserRoleMapping, // User role mappings
      Role, // Role definitions
      UserTenantMapping, // User tenant mappings
      RolePrivilegeMapping, // Role privilege mappings
    ]),
    HttpModule,
    PostgresModule,
    ElasticsearchModule,
    forwardRef(() => FormsModule),
    ConfigModule,
  ],
  controllers: [CohortMembersController],
  providers: [
    CohortMembersAdapter, // Service locator for database adapters
    PostgresCohortMembersService, // PostgreSQL implementation of cohort member operations
    PostgresAcademicYearService, // Academic year service for validation
    CohortMembersCronService, // Automated cron job service for shortlisting evaluation
    PostgresRoleService, // Role service for user role operations
    JwtUtil, // JWT utility for token operations
    ConfigService, // Configuration service
    CohortAcademicYearService, // Cohort academic year service
    AuthUtils, // Authentication utilities
    NotificationRequest, // Notification request service
  ],
  exports: [
    PostgresCohortMembersService, // Export for use in other modules
  ],
})
export class CohortMembersModule {}
