// src/elasticsearch/elasticsearch.config.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ElasticsearchConfig {
  private readonly logger = new Logger(ElasticsearchConfig.name);

  readonly node = process.env.ELASTICSEARCH_HOST ?? 'http://localhost:9200';

  constructor() {
    this.logger.log(`Elasticsearch node: ${this.node}`);
  }
}
