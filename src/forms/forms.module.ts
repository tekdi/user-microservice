import { Module } from '@nestjs/common';
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
import { CohortMembersModule } from '../cohortMembers/cohortMembers.module';
import { PostgresModule } from '../adapters/postgres/postgres-module';
import { PostgresCohortMembersService } from '../adapters/postgres/cohortMembers-adapter';
import { CohortMembers } from '../cohortMembers/entities/cohort-member.entity';
import { User } from '../user/entities/user-entity';
import { Cohort } from '../cohort/entities/cohort.entity';
import { CohortAcademicYear } from '../cohortAcademicYear/entities/cohortAcademicYear.entity';
import { AcademicYear } from '../academicyears/entities/academicyears-entity';
import { Tenants } from '../userTenantMapping/entities/tenant.entity';

@Module({
  controllers: [FormsController, FormSubmissionController],
  imports: [
    TypeOrmModule.forFeature([
      Form,
      Fields,
      FieldValues,
      FormSubmission,
      CohortMembers,
      User,
      Cohort,
      CohortAcademicYear,
      AcademicYear,
      Tenants,
    ]),
    CohortMembersModule,
    PostgresModule,
  ],
  providers: [
    FormsService,
    PostgresFieldsService,
    FormSubmissionService,
    FieldsService,
    PostgresCohortMembersService,
  ],
  exports: [FormSubmissionService],
})
export class FormsModule {}
