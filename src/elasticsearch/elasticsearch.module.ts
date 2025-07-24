// src/elasticsearch/elasticsearch.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchConfig } from './elasticsearch.config';
import { ElasticsearchService } from './elasticsearch.service';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { UserElasticsearchController } from './user-elasticsearch.controller';
import { ElasticsearchDataFetcherService } from './elasticsearch-data-fetcher.service';
import { User } from '../user/entities/user-entity';
import { CohortMembers } from '../cohortMembers/entities/cohort-member.entity';
import { FormSubmission } from '../forms/entities/form-submission.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { Fields } from '../fields/entities/fields.entity';
import { Cohort } from '../cohort/entities/cohort.entity';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import { FormsService } from '../forms/forms.service';
import { Form } from '../forms/entities/form.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CohortMembers,
      FormSubmission,
      FieldValues,
      Fields,
      Cohort,
      Form,
    ]),
  ],
  controllers: [UserElasticsearchController],
  providers: [
    ElasticsearchConfig,
    ElasticsearchService,
    UserElasticsearchService,
    ElasticsearchDataFetcherService,
    PostgresFieldsService,
    FormsService,
  ],
  exports: [
    ElasticsearchService,
    UserElasticsearchService,
    ElasticsearchDataFetcherService
  ],
})
export class ElasticsearchModule {}
