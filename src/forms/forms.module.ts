import { Module, forwardRef } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { Form } from './entities/form.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgresFieldsService } from 'src/adapters/postgres/fields-adapter';
import { Fields } from 'src/fields/entities/fields.entity';
import { FieldValues } from 'src/fields/entities/fields-values.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { FormSubmissionService } from './services/form-submission.service';
import { FormSubmissionController } from './controllers/form-submission.controller';
import { FieldsService } from '../fields/fields.service';
import { ElasticsearchModule } from 'src/elasticsearch/elasticsearch.module';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
import { UserTenantMapping } from 'src/userTenantMapping/entities/user-tenant-mapping.entity';
import { User } from 'src/user/entities/user-entity';
import { CohortAcademicYear } from 'src/cohortAcademicYear/entities/cohortAcademicYear.entity';
import { PostgresAcademicYearService } from 'src/adapters/postgres/academicyears-adapter';
import { CohortAcademicYearService } from 'src/adapters/postgres/cohortAcademicYear-adapter';
import { AcademicYear } from 'src/academicyears/entities/academicyears-entity';
import { Tenants } from 'src/userTenantMapping/entities/tenant.entity';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationRequest } from 'src/common/utils/notification.axios';
import { CohortModule } from 'src/cohort/cohort.module';
@Module({
  controllers: [FormsController, FormSubmissionController],
  imports: [
    TypeOrmModule.forFeature([
      Form,
      Fields,
      FieldValues,
      FormSubmission,
      Cohort,
      CohortMembers,
      UserTenantMapping,
      User,
      CohortAcademicYear,
      AcademicYear,
      Tenants,
    ]),
    ElasticsearchModule,
    HttpModule,
    ConfigModule,
    forwardRef(() => CohortModule),
  ],
  providers: [
    FormsService,
    PostgresFieldsService,
    FieldsService,
    PostgresAcademicYearService,
    CohortAcademicYearService,
    NotificationRequest,
    FormSubmissionService,
  ],
  exports: [FormSubmissionService, FormsService],
})
export class FormsModule {}
