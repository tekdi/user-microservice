// src/elasticsearch/elasticsearch.config.ts
import { Injectable, Logger } from '@nestjs/common';
import { isElasticsearchEnabled } from '../common/utils/elasticsearch.util';

@Injectable()
export class ElasticsearchConfig {
  private readonly logger = new Logger(ElasticsearchConfig.name);

  readonly node = isElasticsearchEnabled()
    ? process.env.ELASTICSEARCH_HOST ?? 'http://localhost:9200'
    : undefined;

  constructor() {
    if (isElasticsearchEnabled()) {
      this.logger.log(`Elasticsearch node: ${this.node}`);
    } else {
      this.logger.log('Elasticsearch is disabled by USE_ELASTICSEARCH flag.');
    }
  }
}