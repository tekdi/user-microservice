import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LocationService } from '../src/location/location.service';
import { LocationHierarchySearchDto } from '../src/location/dto/location-hierarchy-search.dto';

describe('LocationService Unit Tests', () => {
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
        // LocationRepository removed - Location table doesn't exist
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hierarchySearch', () => {
    describe('Child Direction Tests', () => {
      it('should fetch only districts when target is district', async () => {
        const mockDistricts = [
          { district_id: 1, district_name: 'Test District', state_id: 27, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockDistricts); // Districts query

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
        expect(result.totalCount).toBe(1);

        // Should only call district query, not block or village queries
        expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      });

      it('should fetch only villages with keyword filter', async () => {
        const mockVillages = [
          { village_id: 1, village_name: 'Test Village', block_id: 100, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockVillages); // Villages query

        const searchDto: LocationHierarchySearchDto = {
          id: '50',
          type: 'block',
          direction: 'child',
          target: ['village'],
          keyword: 'Test'
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].type).toBe('village');
        
        // Verify keyword was passed to query
        const lastCall = mockDataSource.query.mock.calls[1];
        expect(lastCall[0]).toContain('LOWER(village_name) LIKE LOWER($2)');
        expect(lastCall[1]).toEqual([50, '%test%']);
      });

      it('should handle multiple target types', async () => {
        const mockDistricts = [
          { district_id: 1, district_name: 'District 1', state_id: 27, is_active: 1, is_found_in_census: 1 }
        ];
        const mockBlocks = [
          { block_id: 1, block_name: 'Block 1', district_id: 1, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockDistricts); // Districts query
        mockDataSource.query.mockResolvedValueOnce(mockBlocks); // Blocks query

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
        expect(mockDataSource.query).toHaveBeenCalledTimes(3); // exists + districts + blocks
      });
    });

    describe('Parent Direction Tests', () => {
      it('should fetch all parents from village', async () => {
        const mockParentData = [{
          village_id: 1, village_name: 'Test Village', block_id: 100,
          v_is_found_in_census: 1, v_is_active: 1,
          block_name: 'Test Block', district_id: 10,
          b_is_found_in_census: 1, b_is_active: 1,
          district_name: 'Test District', state_id: 1,
          d_is_found_in_census: 1, d_is_active: 1,
          state_name: 'Test State', state_code: 'TS',
          s_is_found_in_census: 1, s_is_active: 1
        }];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockParentData); // Parent query

        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'village',
          direction: 'parent'
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(3); // block, district, state
        expect(result.data.map(item => item.type)).toEqual(['block', 'district', 'state']);
      });

      it('should fetch specific parent types only', async () => {
        const mockParentData = [{
          village_id: 1, village_name: 'Test Village', block_id: 100,
          v_is_found_in_census: 1, v_is_active: 1,
          block_name: 'Test Block', district_id: 10,
          b_is_found_in_census: 1, b_is_active: 1,
          district_name: 'Test District', state_id: 1,
          d_is_found_in_census: 1, d_is_active: 1,
          state_name: 'Test State', state_code: 'TS',
          s_is_found_in_census: 1, s_is_active: 1
        }];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockParentData); // Parent query

        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'village',
          direction: 'parent',
          target: ['state']
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].type).toBe('state');
        expect(result.data[0].state_code).toBe('TS');
      });
    });

    describe('Validation Tests', () => {
      it('should throw BadRequestException for non-existent entity', async () => {
        mockDataSource.query.mockResolvedValueOnce([]); // Entity doesn't exist

        const searchDto: LocationHierarchySearchDto = {
          id: '999999',
          type: 'state',
          direction: 'child'
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(BadRequestException);
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      });

      it('should throw BadRequestException for invalid target types', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists

        const searchDto: any = {
          id: '1',
          type: 'village',
          direction: 'child',
          target: ['district'] // Invalid: village cannot have district children
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(BadRequestException);
      });

      it('should validate numeric ID format', async () => {
        const searchDto: LocationHierarchySearchDto = {
          id: 'invalid_id',
          type: 'state',
          direction: 'child'
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(BadRequestException);
      });
    });

    describe('Query Optimization Tests', () => {
      it('should use parameterized queries to prevent SQL injection', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce([]); // Districts query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: "'; DROP TABLE district; --"
        };

        await service.hierarchySearch(searchDto);

        // Verify parameterized query was used
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).toContain('$2'); // Parameter placeholder
        expect(queryCall[1]).toEqual([27, "%'; DROP TABLE district; --%"]); // Escaped parameter
      });

      it('should skip unnecessary queries when targets are specified', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce([]); // Only districts query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'] // Only districts, should skip blocks and villages
        };

        await service.hierarchySearch(searchDto);

        // Should only call entity check + districts query, not blocks or villages
        expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      });

      it('should handle empty keyword gracefully', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce([]); // Districts query

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district'],
          keyword: '   ' // Whitespace only
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        
        // Should not include keyword filter in query
        const queryCall = mockDataSource.query.mock.calls[1];
        expect(queryCall[0]).not.toContain('LIKE');
        expect(queryCall[1]).toEqual([27]); // No keyword parameter
      });
    });

    describe('Response Format Tests', () => {
      it('should return correct response structure', async () => {
        const mockDistricts = [
          { district_id: 1, district_name: 'Test District', state_id: 27, is_active: 1, is_found_in_census: 1 }
        ];
        
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce(mockDistricts); // Districts query

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

      it('should handle empty results correctly', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check
        mockDataSource.query.mockResolvedValueOnce([]); // Empty result

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child',
          target: ['district']
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(result.totalCount).toBe(0);
      });
    });

    describe('Edge Cases', () => {
      it('should handle village with no children', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check

        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'village',
          direction: 'child'
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(result.totalCount).toBe(0);
        
        // Should only check entity existence, no child queries
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      });

      it('should handle state with no parents', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ count: 1 }]); // Entity exists check

        const searchDto: LocationHierarchySearchDto = {
          id: '1',
          type: 'state',
          direction: 'parent'
        };

        const result = await service.hierarchySearch(searchDto);

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(result.totalCount).toBe(0);
        
        // Should only check entity existence, no parent queries
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      });

      it('should handle database connection errors gracefully', async () => {
        mockDataSource.query.mockRejectedValueOnce(new Error('Database connection failed'));

        const searchDto: LocationHierarchySearchDto = {
          id: '27',
          type: 'state',
          direction: 'child'
        };

        await expect(service.hierarchySearch(searchDto)).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('Helper Methods', () => {
    describe('entityExists', () => {
      it('should return true for existing entity', async () => {
        mockDataSource.query.mockResolvedValueOnce([{ exists: true }]);

        // Access private method for testing
        const result = await (service as any).entityExists('27', 'state');

        expect(result).toBe(true);
        expect(mockDataSource.query).toHaveBeenCalledWith(
          'SELECT 1 FROM state WHERE state_id = $1 LIMIT 1',
          [27]
        );
      });

      it('should return false for non-existing entity', async () => {
        mockDataSource.query.mockResolvedValueOnce([]);

        const result = await (service as any).entityExists('999', 'state');

        expect(result).toBe(false);
      });

      it('should return false for invalid ID format', async () => {
        const result = await (service as any).entityExists('invalid', 'state');

        expect(result).toBe(false);
        expect(mockDataSource.query).not.toHaveBeenCalled();
      });
    });

    describe('getValidTargets', () => {
      it('should return correct child targets', () => {
        const result = (service as any).getValidTargets('state', 'child');
        expect(result).toEqual(['district', 'block', 'village']);
      });

      it('should return correct parent targets', () => {
        const result = (service as any).getValidTargets('village', 'parent');
        expect(result).toEqual(['state', 'district', 'block']);
      });

      it('should return empty array for state parents', () => {
        const result = (service as any).getValidTargets('state', 'parent');
        expect(result).toEqual([]);
      });

      it('should return empty array for village children', () => {
        const result = (service as any).getValidTargets('village', 'child');
        expect(result).toEqual([]);
      });
    });
  });
});