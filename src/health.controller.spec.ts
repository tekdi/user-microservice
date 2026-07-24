import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DataSource } from 'typeorm';
import { CacheHealthIndicator } from './cache/cache-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: DataSource;
  let cacheHealth: { check: jest.Mock };

  beforeEach(async () => {
    const mockDataSource = {
      query: jest.fn(),
    };
    cacheHealth = {
      check: jest.fn().mockResolvedValue({
        enabled: false,
        provider: 'memory',
        redis: 'disabled',
        disabledNamespaces: [],
        namespaces: {},
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: CacheHealthIndicator,
          useValue: cacheHealth,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return healthy status when database is accessible', async () => {
      // Mock successful database query
      jest.spyOn(dataSource, 'query').mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.getHealth();

      expect(result.id).toBe('api.content.health');
      expect(result.ver).toBe('3.0');
      expect(result.responseCode).toBe('OK');
      expect(result.params.status).toBe('successful');
      expect(result.result.healthy).toBe(true);
      expect(result.result.checks[0]).toEqual({ name: 'postgres db', healthy: true });
      expect(result.params.resmsgid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should return unhealthy status when database is not accessible', async () => {
      // Mock database query failure
      jest.spyOn(dataSource, 'query').mockRejectedValue(new Error('Connection failed'));

      const result = await controller.getHealth();

      expect(result.id).toBe('api.content.health');
      expect(result.ver).toBe('3.0');
      expect(result.responseCode).toBe('OK');
      expect(result.params.status).toBe('successful');
      expect(result.result.healthy).toBe(false);
      expect(result.result.checks[0]).toEqual({ name: 'postgres db', healthy: false });
    });

    // Redis is informational and must never fail the health check.
    it('stays healthy when Redis is unreachable', async () => {
      jest.spyOn(dataSource, 'query').mockResolvedValue([{ '?column?': 1 }]);
      cacheHealth.check.mockResolvedValue({
        enabled: true,
        provider: 'redis',
        redis: 'unreachable',
        disabledNamespaces: [],
        namespaces: {},
      });

      const result = await controller.getHealth();

      expect(result.result.healthy).toBe(true);
      expect(result.result.cache.redis).toBe('unreachable');
    });

    it('stays healthy even if the cache probe itself throws', async () => {
      jest.spyOn(dataSource, 'query').mockResolvedValue([{ '?column?': 1 }]);
      cacheHealth.check.mockRejectedValue(new Error('boom'));

      const result = await controller.getHealth();

      expect(result.result.healthy).toBe(true);
      expect(result.result.cache.redis).toBe('unknown');
    });
  });
});