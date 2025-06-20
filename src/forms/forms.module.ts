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

@Module({
  controllers: [FormsController, FormSubmissionController],
  imports: [
    TypeOrmModule.forFeature([Form, Fields, FieldValues, FormSubmission]),
  ],
  providers: [
    FormsService,
    PostgresFieldsService,
    FormSubmissionService,
    FieldsService,
  ],
  exports: [FormsService, FormSubmissionService],
})
export class FormsModule {}
