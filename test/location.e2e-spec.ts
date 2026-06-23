import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { LocationHierarchySearchDto } from '../src/location/dto/location-hierarchy-search.dto';

describe('Location Module (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Test data IDs (these should exist in your test database)
  const TEST_DATA = {
    state: { id: 27, name: 'West Bengal' },
    district: { id: 421, name: 'Nandurbar', state_id: 27 },
    block: { id: 5001, name: 'Akkalkuwa', district_id: 421 },
    village: { id: 90001, name: 'Nandurbar Village', block_id: 5001 }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    
    await app.init();
    
    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await app.close();
  });

  describe('POST /location/hierarchy-search', () => {
    describe('Child Direction Tests', () => {
      it('should get all districts under a state', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0]).toHaveProperty('type', 'district');
        expect(response.body.data[0]).toHaveProperty('parent_id', TEST_DATA.state.id);
        expect(response.body.totalCount).toBe(response.body.data.length);
      });

      it('should get districts with keyword filter', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'Nandurbar'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        
        // All returned districts should contain 'Nandurbar' in name
        response.body.data.forEach(district => {
          expect(district.name.toLowerCase()).toContain('nandurbar');
          expect(district.type).toBe('district');
        });
      });

      it('should get all blocks under a district', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.district.id.toString(),
          type: 'district',
          direction: 'child',
          target: ['block']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0]).toHaveProperty('type', 'block');
        expect(response.body.data[0]).toHaveProperty('parent_id', TEST_DATA.district.id);
      });

      it('should get all villages under a block', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.block.id.toString(),
          type: 'block',
          direction: 'child',
          target: ['village']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0]).toHaveProperty('type', 'village');
        expect(response.body.data[0]).toHaveProperty('parent_id', TEST_DATA.block.id);
      });

      it('should get multiple target types from state', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district', 'block']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('district');
        expect(types).toContain('block');
        expect(types).not.toContain('village'); // Not requested
      });

      it('should get all children when no target specified', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.district.id.toString(),
          type: 'district',
          direction: 'child'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('block');
        expect(types).toContain('village');
      });

      it('should return empty array for village children', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.village.id.toString(),
          type: 'village',
          direction: 'child'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.totalCount).toBe(0);
      });
    });

    describe('Parent Direction Tests', () => {
      it('should get all parents from village', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.village.id.toString(),
          type: 'village',
          direction: 'parent'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBe(3); // block, district, state
        
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('block');
        expect(types).toContain('district');
        expect(types).toContain('state');
      });

      it('should get specific parent types from village', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.village.id.toString(),
          type: 'village',
          direction: 'parent',
          target: ['state']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].type).toBe('state');
      });

      it('should get parents from block', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.block.id.toString(),
          type: 'block',
          direction: 'parent'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBe(3); // block itself, district, state
        
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('block');
        expect(types).toContain('district');
        expect(types).toContain('state');
      });

      it('should get parents from district', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.district.id.toString(),
          type: 'district',
          direction: 'parent'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBe(2); // district itself, state
        
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('district');
        expect(types).toContain('state');
      });

      it('should return empty array for state parents', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'parent'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.totalCount).toBe(0);
      });
    });

    describe('Keyword Search Tests', () => {
      it('should filter results by keyword case-insensitive', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'NANDURBAR' // Uppercase to test case insensitivity
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.data.forEach(item => {
          expect(item.name.toLowerCase()).toContain('nandurbar');
        });
      });

      it('should return empty array when keyword matches nothing', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'NonExistentLocation12345'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.totalCount).toBe(0);
      });

      it('should handle partial keyword matches', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'Nand' // Partial match
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.data.forEach(item => {
          expect(item.name.toLowerCase()).toContain('nand');
        });
      });
    });

    describe('Response Structure Tests', () => {
      it('should return correct response structure', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        // Check main response structure
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('totalCount');
        expect(response.body).toHaveProperty('searchParams');

        // Check search params echo
        expect(response.body.searchParams).toEqual({
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: undefined
        });

        // Check data item structure
        if (response.body.data.length > 0) {
          const item = response.body.data[0];
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('type');
          expect(item).toHaveProperty('parent_id');
          expect(item).toHaveProperty('is_active');
          expect(item).toHaveProperty('is_found_in_census');
        }
      });

      it('should include state_code for state entities', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.district.id.toString(),
          type: 'district',
          direction: 'parent',
          target: ['state']
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        const stateItem = response.body.data.find(item => item.type === 'state');
        expect(stateItem).toHaveProperty('state_code');
      });
    });

    describe('Performance Tests', () => {
      it('should complete targeted search quickly', async () => {
        const startTime = Date.now();
        
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'Nandurbar'
        };

        await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should complete in less than 2 seconds (much faster than the original 33 seconds)
        expect(duration).toBeLessThan(2000);
      });

      it('should handle large result sets efficiently', async () => {
        const startTime = Date.now();
        
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['village'] // This could be a large dataset
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Even large datasets should complete reasonably quickly
        expect(duration).toBeLessThan(5000);
        expect(response.body.success).toBe(true);
      });
    });

    describe('Error Handling Tests', () => {
      it('should return 400 for missing required fields', async () => {
        const invalidDto = {
          type: 'state',
          direction: 'child'
          // Missing 'id' field
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('ID is required');
      });

      it('should return 400 for invalid type', async () => {
        const invalidDto: any = {
          id: '123',
          type: 'invalid_type',
          direction: 'child'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Type must be one of');
      });

      it('should return 400 for invalid direction', async () => {
        const invalidDto: any = {
          id: '123',
          type: 'state',
          direction: 'invalid_direction'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Direction must be either');
      });

      it('should return 400 for non-existent location ID', async () => {
        const invalidDto: LocationHierarchySearchDto = {
          id: '999999',
          type: 'state',
          direction: 'child'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('not found');
      });

      it('should return 400 for invalid target types', async () => {
        const invalidDto: any = {
          id: TEST_DATA.village.id.toString(),
          type: 'village',
          direction: 'child',
          target: ['district'] // Village cannot have district children
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Invalid target types');
      });

      it('should return 400 for invalid numeric ID', async () => {
        const invalidDto: LocationHierarchySearchDto = {
          id: 'not_a_number',
          type: 'state',
          direction: 'child'
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(invalidDto)
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should handle empty target array', async () => {
        const searchDto: any = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: [] // Empty array should default to all types
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should handle whitespace-only keyword', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: '   ' // Only whitespace
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        // Should return all districts since whitespace keyword is ignored
        expect(response.body.data.length).toBeGreaterThan(0);
      });
    });

    describe('Edge Cases Tests', () => {
      it('should handle very long keywords gracefully', async () => {
        const longKeyword = 'a'.repeat(1000);
        
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: longKeyword
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]); // Should return empty array
      });

      it('should handle special characters in keyword', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: "test'district\"with%special_chars"
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        // Should not cause SQL injection or errors
      });

      it('should handle maximum target array', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: TEST_DATA.state.id.toString(),
          type: 'state',
          direction: 'child',
          target: ['district', 'block', 'village'] // All possible child types
        };

        const response = await request(app.getHttpServer())
          .post('/location/hierarchy-search')
          .send(searchDto)
          .expect(200);

        expect(response.body.success).toBe(true);
        const types = response.body.data.map(item => item.type);
        expect(types).toContain('district');
        expect(types).toContain('block');
        expect(types).toContain('village');
      });
    });
  });

  // Legacy endpoints tests removed - Location table doesn't exist
  // All functionality now handled by hierarchy-search endpoint

  // Helper functions
  async function setupTestData() {
    try {
      // Insert test state
      await dataSource.query(`
        INSERT INTO state (state_id, state_name, state_code, is_active, is_found_in_census) 
        VALUES ($1, $2, $3, 1, 1) 
        ON CONFLICT (state_id) DO NOTHING
      `, [TEST_DATA.state.id, TEST_DATA.state.name, 'WB']);

      // Insert test district
      await dataSource.query(`
        INSERT INTO district (district_id, district_name, state_id, is_active, is_found_in_census) 
        VALUES ($1, $2, $3, 1, 1) 
        ON CONFLICT (district_id) DO NOTHING
      `, [TEST_DATA.district.id, TEST_DATA.district.name, TEST_DATA.district.state_id]);

      // Insert test block
      await dataSource.query(`
        INSERT INTO block (block_id, block_name, district_id, is_active, is_found_in_census) 
        VALUES ($1, $2, $3, 1, 1) 
        ON CONFLICT (block_id) DO NOTHING
      `, [TEST_DATA.block.id, TEST_DATA.block.name, TEST_DATA.block.district_id]);

      // Insert test village
      await dataSource.query(`
        INSERT INTO village (village_id, village_name, block_id, is_active, is_found_in_census) 
        VALUES ($1, $2, $3, 1, 1) 
        ON CONFLICT (village_id) DO NOTHING
      `, [TEST_DATA.village.id, TEST_DATA.village.name, TEST_DATA.village.block_id]);

      console.log('Test data setup completed');
    } catch (error) {
      console.error('Error setting up test data:', error);
    }
  }

  async function cleanupTestData() {
    try {
      // Clean up in reverse order due to foreign key constraints
      await dataSource.query('DELETE FROM village WHERE village_id = $1', [TEST_DATA.village.id]);
      await dataSource.query('DELETE FROM block WHERE block_id = $1', [TEST_DATA.block.id]);
      await dataSource.query('DELETE FROM district WHERE district_id = $1', [TEST_DATA.district.id]);
      await dataSource.query('DELETE FROM state WHERE state_id = $1', [TEST_DATA.state.id]);
      
      console.log('Test data cleanup completed');
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  }
});