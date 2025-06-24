// src/elasticsearch/elasticsearch.config.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElasticsearchConfig {
  readonly node = process.env.ELASTICSEARCH_HOST ?? 'http://localhost:9200';
}

console.log(`Elasticsearch node: ${process.env.ELASTICSEARCH_HOST}`);
