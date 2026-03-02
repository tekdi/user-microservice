import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// import { MulterModule } from "@nestjs/platform-express/multer";
// Below modules not in use for Shiksha 2.0

/*
import { ConfigurationModule } from "./configs/configuration.module";
*/
// In use for Shiksha 2.0
import { DatabaseModule } from './common/database.module';
import { AuthModule } from './auth/auth.module';
import { AuthRbacModule } from './authRbac/authRbac.module';
import { CohortModule } from './cohort/cohort.module';
import { CohortMembersModule } from './cohortMembers/cohortMembers.module';
import { FieldsModule } from './fields/fields.module';
import { UserModule } from './user/user.module';
import { RbacModule } from './rbac/rbac.module';
import { AssignTenantModule } from './userTenantMapping/user-tenant-mapping.module';
import { FormsModule } from './forms/forms.module';
import { HttpService } from '@utils/http-service';
import { TenantModule } from './tenant/tenant.module';
import { AcademicyearsModule } from './academicyears/academicyears.module';
import { CohortAcademicYearModule } from './cohortAcademicYear/cohortAcademicYear.module';
import { storageConfig } from './config/storage.config';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { BulkImportModule } from './bulk-import/bulk-import.module';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { CacheModule } from './cache/cache.module';
import { PaymentsModule } from './payments/payments.module';
import { PathwaysModule } from './pathways/pathways.module';
import { CountriesModule } from './countries/countries.module';
import { ContentModule } from './content/content.module';
import { CountriesModule } from './countries/countries.module';

/**
 * Main Application Module
 *
 * This is the root module of the NestJS application that orchestrates all
 * feature modules and provides global configuration.
 *
 * Key Features:
 * - Global configuration management
 * - Scheduled task execution (cron jobs)
 * - Database connectivity
 * - Authentication and authorization
 * - Multi-tenant support
 * - File storage configuration
 *
 * Scheduled Tasks:
 * - Cohort member shortlisting evaluation (daily at 2 AM)
 * - Other automated processes as needed
 *
 * Module Structure:
 * - Core modules: User, Auth, RBAC, Database
 * - Feature modules: Cohort, CohortMembers, Fields, Forms, Pathways
 * - Support modules: Tenant, AcademicYears, Storage
 */
@Module({
  imports: [
    // Core system modules
    RbacModule, // Role-based access control
    ConfigModule.forRoot({ isGlobal: true }), // Global configuration management

    // Scheduled task execution for automated processes
    // Enables cron jobs like cohort member shortlisting evaluation
    ScheduleModule.forRoot(),

    // File upload configuration (commented out)
    // MulterModule.register({
    //   dest: "./uploads",
    // }),
    UserModule,
    CohortModule,
    CohortMembersModule,
    AssignTenantModule,
    FieldsModule,
    AuthModule,
    AuthRbacModule,
    DatabaseModule,
    FormsModule,
    TenantModule,
    AcademicyearsModule,
    CohortAcademicYearModule,
    ElasticsearchModule,
    BulkImportModule,
    TerminusModule,
    CacheModule,
    PaymentsModule,
    PathwaysModule,
    CountriesModule,
    ContentModule,
    CountriesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    HttpService,
    HealthService,
    {
      provide: 'STORAGE_CONFIG',
      useValue: storageConfig,
    },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  onModuleInit() {
    this.logger.log('AppModule initialized successfully');
    this.logger.log('PaymentsModule is included in AppModule imports');
    this.logger.debug('All modules loaded:', [
      'RbacModule',
      'UserModule',
      'CohortModule',
      'CohortMembersModule',
      'AssignTenantModule',
      'FieldsModule',
      'AuthModule',
      'AuthRbacModule',
      'DatabaseModule',
      'FormsModule',
      'TenantModule',
      'AcademicyearsModule',
      'CohortAcademicYearModule',
      'ElasticsearchModule',
      'BulkImportModule',
      'TerminusModule',
      'CacheModule',
      'PaymentsModule',
      'PathwaysModule',
      'ContentModule',
    ]);
  }
}
