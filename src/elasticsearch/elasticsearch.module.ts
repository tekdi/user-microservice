// src/elasticsearch/elasticsearch.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchService } from './elasticsearch.service';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { ElasticsearchConfig } from './elasticsearch.config';
import { UserElasticsearchController } from './user-elasticsearch.controller';
import { ElasticsearchSyncService } from './elasticsearch-sync.service';
import { User } from '../user/entities/user-entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserElasticsearchController],
  providers: [
    ElasticsearchConfig,
    ElasticsearchService,
    UserElasticsearchService,
    ElasticsearchSyncService
  ],
  exports: [ElasticsearchService, UserElasticsearchService, ElasticsearchSyncService],
})
export class ElasticsearchModule {}
