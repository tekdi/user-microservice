// src/elasticsearch/elasticsearch.module.ts
import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { ElasticsearchConfig } from './elasticsearch.config';
import { UserElasticsearchController } from './user-elasticsearch.controller';

@Module({
  controllers: [UserElasticsearchController],
  providers: [
    ElasticsearchConfig,
    ElasticsearchService,
    UserElasticsearchService
  ],
  exports: [ElasticsearchService, UserElasticsearchService],
})
export class ElasticsearchModule {}
