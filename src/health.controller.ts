import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CacheHealthIndicator } from './cache/cache-health.indicator';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheHealth: CacheHealthIndicator,
  ) {}

  @Get('health')
  async getHealth() {
    let dbHealthy = false;

    try {
      // Check database connectivity with a simple query
      await this.dataSource.query('SELECT 1');
      dbHealthy = true;
    } catch (error) {
      dbHealthy = false;
    }

    // Redis is informational only and deliberately NOT part of `healthy` — a
    // dead Redis degrades to DB reads, so it must never take the pod out of service.
    let cache;
    try {
      cache = await this.cacheHealth.check();
    } catch (error) {
      cache = { redis: 'unknown' };
    }

    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'ZZ');

    return {
      id: 'api.content.health',
      ver: '3.0',
      ts: timestamp,
      params: {
        resmsgid: uuidv4(),
        msgid: null,
        err: null,
        status: 'successful',
        errmsg: null,
      },
      responseCode: 'OK',
      result: {
        checks: [
          { name: 'postgres db', healthy: dbHealthy },
          // informational: never contributes to `healthy`
          { name: 'cache/redis', healthy: dbHealthy, info: cache },
        ],
        healthy: dbHealthy,
        cache,
      },
    };
  }
}
