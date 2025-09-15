// src/elasticsearch/elasticsearch.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { ElasticsearchDataFetcherService } from './elasticsearch-data-fetcher.service';
import { ElasticsearchSyncService } from './elasticsearch-sync.service';
import { ElasticsearchService } from './elasticsearch.service';
import { UserElasticsearchController } from './user-elasticsearch.controller';
import { ElasticsearchController } from './controllers/elasticsearch.controller';
import { User } from '../user/entities/user-entity';
import { CohortMembers } from '../cohortMembers/entities/cohort-member.entity';
import { FormSubmission } from '../forms/entities/form-submission.entity';
import { Form } from '../forms/entities/form.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { Fields } from '../fields/entities/fields.entity';
import { Cohort } from '../cohort/entities/cohort.entity';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import { FormsService } from '../forms/forms.service';
import { LMSService } from '../common/services/lms.service';
import { HttpService } from '../common/utils/http-service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CohortMembers,
      FormSubmission,
      Form,
      FieldValues,
      Fields,
      Cohort,
    ]),
  ],
  controllers: [
    UserElasticsearchController, // Add the controller
    ElasticsearchController, // Add the sync controller
  ],
  providers: [
    ConfigService,
    ElasticsearchService, // Add this missing service
    UserElasticsearchService,
    ElasticsearchDataFetcherService,
    ElasticsearchSyncService,
    PostgresFieldsService,
    FormsService,
    LMSService,
    HttpService,
  ],
  exports: [
    ConfigService,
    ElasticsearchService, // Export it as well
    UserElasticsearchService,
    ElasticsearchDataFetcherService,
    ElasticsearchSyncService,
  ],
})
export class ElasticsearchModule {}
