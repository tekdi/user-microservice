import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { LocationHierarchySearchDto } from '../src/location/dto/location-hierarchy-search.dto';

describe('Location Module Performance Tests (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const PERFORMANCE_THRESHOLDS = {
    TARGETED_SEARCH: 1000, // 1 second
    LARGE_DATASET: 3000,   // 3 seconds
    KEYWORD_SEARCH: 2000,  // 2 seconds
    PARENT_SEARCH: 500,    // 0.5 seconds
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    
    await app.init();
    
    // Setup performance test data
    await setupPerformanceTestData();
  });

  afterAll(async () => {
    await cleanupPerformanceTestData();
    await app.close();
  });

  describe('Optimized Query Performance', () => {
    it('should complete targeted district search in under 1 second', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district']
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.TARGETED_SEARCH);
      
      console.log(`Targeted district search completed in ${duration.toFixed(2)}ms`);
    });

    it('should complete keyword search efficiently', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district'],
        keyword: 'Test'
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.KEYWORD_SEARCH);
      
      console.log(`Keyword search completed in ${duration.toFixed(2)}ms`);
    });

    it('should complete parent search very quickly', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1001',
        type: 'village',
        direction: 'parent'
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PARENT_SEARCH);
      
      console.log(`Parent search completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle large village dataset efficiently', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['village']
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_DATASET);
      
      console.log(`Large village dataset search completed in ${duration.toFixed(2)}ms (${response.body.totalCount} results)`);
    });
  });

  describe('Query Efficiency Tests', () => {
    it('should not fetch unnecessary data when target is specified', async () => {
      // This test verifies that when asking for only districts,
      // we don't fetch blocks and villages
      
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district']
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(item => item.type === 'district')).toBe(true);
      
      // Should be very fast since we're only querying one table
      expect(duration).toBeLessThan(500);
      
      console.log(`Targeted district-only search completed in ${duration.toFixed(2)}ms`);
    });

    it('should efficiently filter with keyword at SQL level', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district'],
        keyword: 'NonExistent'
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      
      // Should be fast even with no results because filtering happens at SQL level
      expect(duration).toBeLessThan(500);
      
      console.log(`SQL-level keyword filtering completed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district']
      };

      const startTime = process.hrtime.bigint();
      
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      
      const endTime = process.hrtime.bigint();
      const totalDuration = Number(endTime - startTime) / 1000000;
      const averageDuration = totalDuration / concurrentRequests;

      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });

      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.TARGETED_SEARCH);
      
      console.log(`${concurrentRequests} concurrent requests completed in ${totalDuration.toFixed(2)}ms (avg: ${averageDuration.toFixed(2)}ms per request)`);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not cause memory leaks with large result sets', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform multiple large queries
      for (let i = 0; i < 5; i++) {
        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'state',
          direction: 'child',
          target: ['village']
        };

        await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      console.log(`Memory increase after 5 large queries: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Database Connection Efficiency', () => {
    it('should reuse database connections efficiently', async () => {
      const startTime = process.hrtime.bigint();
      
      // Perform multiple quick requests
      for (let i = 0; i < 20; i++) {
        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);
      }
      
      const endTime = process.hrtime.bigint();
      const totalDuration = Number(endTime - startTime) / 1000000;
      const averageDuration = totalDuration / 20;

      // Average should be very low due to connection reuse
      expect(averageDuration).toBeLessThan(200);
      
      console.log(`20 sequential requests completed in ${totalDuration.toFixed(2)}ms (avg: ${averageDuration.toFixed(2)}ms per request)`);
    });
  });

  describe('Stress Tests', () => {
    it('should handle complex multi-level searches efficiently', async () => {
      const startTime = process.hrtime.bigint();
      
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district', 'block', 'village'],
        keyword: 'Test'
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_DATASET);
      
      console.log(`Complex multi-level search completed in ${duration.toFixed(2)}ms (${response.body.totalCount} results)`);
    });

    it('should maintain performance with long keywords', async () => {
      const startTime = process.hrtime.bigint();
      
      const longKeyword = 'a'.repeat(100);
      const searchDto: LocationHierarchySearchDto = {
        id: '1',
        type: 'state',
        direction: 'child',
        target: ['district'],
        keyword: longKeyword
      };

      const response = await request(app.getHttpServer())
        .post('/location/hierarchy-search')
        .send(searchDto)
        .expect(200);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.KEYWORD_SEARCH);
      
      console.log(`Long keyword search completed in ${duration.toFixed(2)}ms`);
    });
  });

  // Helper functions
  async function setupPerformanceTestData() {
    try {
      // Create test state
      await dataSource.query(`
        INSERT INTO state (state_id, state_name, state_code, is_active, is_found_in_census) 
        VALUES (1, 'Performance Test State', 'PT', 1, 1) 
        ON CONFLICT (state_id) DO NOTHING
      `);

      // Create multiple test districts
      for (let i = 1; i <= 10; i++) {
        await dataSource.query(`
          INSERT INTO district (district_id, district_name, state_id, is_active, is_found_in_census) 
          VALUES ($1, $2, 1, 1, 1) 
          ON CONFLICT (district_id) DO NOTHING
        `, [i, `Test District ${i}`]);
      }

      // Create multiple test blocks
      for (let districtId = 1; districtId <= 10; districtId++) {
        for (let blockNum = 1; blockNum <= 5; blockNum++) {
          const blockId = (districtId - 1) * 5 + blockNum;
          await dataSource.query(`
            INSERT INTO block (block_id, block_name, district_id, is_active, is_found_in_census) 
            VALUES ($1, $2, $3, 1, 1) 
            ON CONFLICT (block_id) DO NOTHING
          `, [blockId, `Test Block ${blockId}`, districtId]);
        }
      }

      // Create multiple test villages
      for (let blockId = 1; blockId <= 50; blockId++) {
        for (let villageNum = 1; villageNum <= 10; villageNum++) {
          const villageId = (blockId - 1) * 10 + villageNum;
          await dataSource.query(`
            INSERT INTO village (village_id, village_name, block_id, is_active, is_found_in_census) 
            VALUES ($1, $2, $3, 1, 1) 
            ON CONFLICT (village_id) DO NOTHING
          `, [villageId, `Test Village ${villageId}`, blockId]);
        }
      }

      console.log('Performance test data setup completed (1 state, 10 districts, 50 blocks, 500 villages)');
    } catch (error) {
      console.error('Error setting up performance test data:', error);
    }
  }

  async function cleanupPerformanceTestData() {
    try {
      // Clean up in reverse order due to foreign key constraints
      await dataSource.query('DELETE FROM village WHERE village_id BETWEEN 1 AND 500');
      await dataSource.query('DELETE FROM block WHERE block_id BETWEEN 1 AND 50');
      await dataSource.query('DELETE FROM district WHERE district_id BETWEEN 1 AND 10');
      await dataSource.query('DELETE FROM state WHERE state_id = 1');
      
      console.log('Performance test data cleanup completed');
    } catch (error) {
      console.error('Error cleaning up performance test data:', error);
    }
  }
});