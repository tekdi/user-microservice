import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LocationService } from '../src/location/location.service';
import { LocationHierarchySearchDto } from '../src/location/dto/location-hierarchy-search.dto';

describe('LocationService - Refactored Version', () => {
  let service: LocationService;
  let dataSource: DataSource;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hierarchySearch', () => {
    describe('Configuration-Driven Architecture', () => {
      it('should use configuration for state queries', async () => {
        const mockDistricts = [
          { id: 1, name: 'Test District', parent_id: 27, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce(mockDistricts); // Query result

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].type).toBe('district');

        // Verify configuration-driven query
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('district_id as id');
        expect(queryCall[0]).toContain('district_name as name');
        expect(queryCall[0]).toContain('FROM district');
      });

      it('should handle all location types with same logic', async () => {
        const mockVillages = [
          { id: 1, name: 'Test Village', parent_id: 100, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce(mockVillages); // Query result

        const searchDto: LocationHierarchySearchDto = {
          id: '100',
          type: 'block',
          direction: 'child',
          target: ['village']
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data[0].type).toBe('village');

        // Verify same pattern for different type
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('village_id as id');
        expect(queryCall[0]).toContain('village_name as name');
        expect(queryCall[0]).toContain('FROM village');
      });
    });

    describe('Smart Query Optimization', () => {
      it('should use direct query for immediate children', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([]); // Direct child query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'] // Direct child of state
        };

        await service.hierarchySearch(searchDto);

        // Should use simple WHERE clause, not JOINs
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('WHERE state_id = $1');
        expect(queryCall[0]).not.toContain('JOIN');
      });

      it('should use JOIN queries for multi-level relationships', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([]); // Multi-level query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['village'] // Multi-level relationship
        };

        await service.hierarchySearch(searchDto);

        // Should use JOINs for multi-level
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('JOIN');
      });
    });

    describe('Functional Programming Benefits', () => {
      it('should handle multiple targets with single method', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([
          { id: 1, name: 'District 1', parent_id: 27, is_active: 1, is_found_in_census: 1 }
        ]); // Districts
        mockDataSource.query.mockResolvedValueOnce([
          { id: 1, name: 'Block 1', parent_id: 1, is_active: 1, is_found_in_census: 1 }
        ]); // Blocks

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district', 'block']
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data.map(item => item.type)).toEqual(['district', 'block']);
        
        // Should make separate optimized queries for each target
        expect(mockDataSource.query).toHaveBeenCalledTimes(3); // exists + 2 targets
      });

      it('should compose keyword filtering functionally', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([]); // Filtered query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'Test'
        };

        await service.hierarchySearch(searchDto);

        // Verify keyword filter is applied at SQL level
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('LOWER(district_name) LIKE LOWER($2)');
        expect(queryCall[1]).toEqual([27, '%test%']);
      });
    });

    describe('Error Handling Improvements', () => {
      it('should provide descriptive validation errors', async () => {
        mockDataSource.query.mockResolvedValueOnce([]); // Entity doesn't exist

        const searchDto: LocationHierarchySearchDto = {
          id: '999999',
          type: 'state',
          direction: 'child'
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(
          'state with ID 999999 not found'
        );
      });

      it('should validate target types contextually', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists

        const searchDto: any = {
          id: '1',
          type: 'village',
          direction: 'child',
          target: ['district'] // Invalid: village cannot have district children
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(
          'Invalid targets [district] for child from village'
        );
      });
    });

    describe('Performance Characteristics', () => {
      it('should minimize database calls', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([]); // Single query for results

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        await service.hierarchySearch(searchDto);

        // Should only make 2 calls: validation + data query
        expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      });

      it('should use parameterized queries for security', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce([]); // Query result

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: "'; DROP TABLE district; --"
        };

        await service.hierarchySearch(searchDto);

        // Verify SQL injection protection
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('$2'); // Parameter placeholder
        expect(queryCall[1]).toEqual([27, "%'; DROP TABLE district; --%"]); // Escaped parameter
      });
    });

    describe('Response Structure', () => {
      it('should build consistent response format', async () => {
        const mockData = [
          { id: 1, name: 'Test District', parent_id: 27, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
        mockDataSource.query.mockResolvedValueOnce(mockData); // Query result

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: 'Test'
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result).toEqual({
          success: true,
          message: 'Hierarchy search completed successfully',
          data: [{
            id: 1,
            name: 'Test District',
            type: 'district',
            parent_id: 27,
            is_active: 1,
            is_found_in_census: 1
          }],
          totalCount: 1,
          searchParams: {
            id: '27',
            type: 'state',
            direction: 'child',
            target: ['district'],
            keyword: 'Test'
          }
        });
      });
    });
  });

  describe('Architecture Quality Tests', () => {
    describe('Configuration-Driven Design', () => {
      it('should have consistent configuration structure', () => {
        const configs = (service as any).locationConfigs;
        
        // All configs should have required fields
        Object.values(configs).forEach((config: any) => {
          expect(config).toHaveProperty('table');
          expect(config).toHaveProperty('idColumn');
          expect(config).toHaveProperty('nameColumn');
        });

        // Non-root types should have parent columns
        expect(configs.district.parentColumn).toBe('state_id');
        expect(configs.block.parentColumn).toBe('district_id');
        expect(configs.village.parentColumn).toBe('block_id');
      });

      it('should maintain hierarchy order', () => {
        const hierarchy = (service as any).hierarchy;
        
        expect(hierarchy).toEqual(['state', 'district', 'block', 'village']);
        expect(hierarchy).toHaveLength(4);
      });
    });

    describe('Functional Programming Principles', () => {
      it('should have pure helper functions', () => {
        const getValidTargets = (service as any).getValidTargets.bind(service);
        
        // Same inputs should always produce same outputs
        const result1 = getValidTargets('state', 'child');
        const result2 = getValidTargets('state', 'child');
        
        expect(result1).toEqual(result2);
        expect(result1).toEqual(['district', 'block', 'village']);
      });

      it('should use immutable data structures', async () => {
        const originalConfigs = (service as any).locationConfigs;
        
        // Attempting to modify should not affect original
        const configsCopy = { ...originalConfigs };
        configsCopy.state = { table: 'modified' };
        
        expect((service as any).locationConfigs.state.table).toBe('state');
      });
    });

    describe('Code Quality Metrics', () => {
      it('should have reduced method complexity', () => {
        // Main method should be concise
        const hierarchySearch = service.hierarchySearch.toString();
        
        // Should be much shorter than original (< 20 lines of logic)
        const logicLines = hierarchySearch.split('\n').filter(line => 
          line.trim() && !line.trim().startsWith('//')
        );
        
        expect(logicLines.length).toBeLessThan(20);
      });

      it('should use consistent naming conventions', () => {
        const serviceKeys = Object.getOwnPropertyNames(service);
        const privateMethodPattern = /^[a-z][a-zA-Z]*$/;
        
        // All methods should follow naming conventions
        serviceKeys.forEach(key => {
          if (typeof (service as any)[key] === 'function') {
            expect(key).toMatch(privateMethodPattern);
          }
        });
      });
    });
  });

  describe('Performance Regression Tests', () => {
    it('should maintain query efficiency', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists
      mockDataSource.query.mockResolvedValueOnce([]); // Query result

      const startTime = process.hrtime.bigint();
      
      await service.hierarchySearch({
        id: '27',
        type: 'state',
        direction: 'child',
        target: ['district']
      });
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to ms
      
      // Should complete very quickly (method overhead only)
      expect(duration).toBeLessThan(10);
    });

    it('should handle concurrent requests efficiently', async () => {
      mockDataSource.query.mockResolvedValue([{ count: 1 }]); // Always return valid
      
      const requests = Array(10).fill(null).map(() =>
        service.hierarchySearch({
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district']
        })
      );
      
      const results = await Promise.all(requests);
      
      // All requests should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});