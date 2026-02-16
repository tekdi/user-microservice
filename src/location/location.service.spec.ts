import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LocationService } from './location.service';
import { LocationHierarchySearchDto } from './dto/location-hierarchy-search.dto';

describe('LocationService', () => {
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

  describe('Security Features', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should prevent SQL injection in ID parameter', async () => {
      const maliciousDto: any = {
        id: "1; DROP TABLE state; --",
        type: 'state',
        direction: 'child'
      };

      await expect(service.hierarchySearch(maliciousDto)).rejects.toThrow(
        BadRequestException
      );

      // Should have made at most 1 query (entity validation with safe ID)
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      
      // Verify the query used safe parameterization
      const [query, params] = mockDataSource.query.mock.calls[0];
      expect(query).toContain('$1');
      expect(params).toEqual([1]); // Parsed and sanitized ID
    });

    it('should prevent SQL injection in keyword parameter', async () => {
      const maliciousDto: LocationHierarchySearchDto = {
        id: '27',
        type: 'state',
        direction: 'child',
        keyword: "'; DROP TABLE district; --"
      };

      await expect(service.hierarchySearch(maliciousDto)).rejects.toThrow(
        'Invalid characters in keyword'
      );
    });

    it('should validate type parameter', async () => {
      const invalidDto: any = {
        id: '27',
        type: 'invalid_type',
        direction: 'child'
      };

      await expect(service.hierarchySearch(invalidDto)).rejects.toThrow(
        'Invalid type'
      );
    });

    it('should validate direction parameter', async () => {
      const invalidDto: any = {
        id: '27',
        type: 'state',
        direction: 'invalid_direction'
      };

      await expect(service.hierarchySearch(invalidDto)).rejects.toThrow(
        'Invalid direction'
      );
    });

    it('should limit keyword length', async () => {
      const longKeyword = 'a'.repeat(101);
      const dto: LocationHierarchySearchDto = {
        id: '27',
        type: 'state',
        direction: 'child',
        keyword: longKeyword
      };

      await expect(service.hierarchySearch(dto)).rejects.toThrow(
        'Keyword too long'
      );
    });
  });

  describe('Functional Features', () => {
    it('should handle valid request with proper mocking', async () => {
      // Mock entity exists
      mockDataSource.query.mockResolvedValueOnce([{ exists: 1 }]);
      // Mock query result
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, name: 'Test District', parent_id: 27, is_active: 1, is_found_in_census: 1 }
      ]);

      const validDto: LocationHierarchySearchDto = {
        id: '27',
        type: 'state',
        direction: 'child',
        target: ['district']
      };

      const result = await service.hierarchySearch(validDto);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('district');
      expect(mockDataSource.query).toHaveBeenCalledTimes(2); // existence check + data query
    });

    it('should handle non-existent entity', async () => {
      // Mock entity doesn't exist
      mockDataSource.query.mockResolvedValueOnce([]);

      const dto: LocationHierarchySearchDto = {
        id: '999999',
        type: 'state',
        direction: 'child'
      };

      await expect(service.hierarchySearch(dto)).rejects.toThrow(
        'state with ID 999999 not found'
      );
    });

    it('should use parameterized queries', async () => {
      // Mock entity exists
      mockDataSource.query.mockResolvedValueOnce([{ exists: 1 }]);
      // Mock query result
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, name: 'Test District', parent_id: 27, is_active: 1, is_found_in_census: 1 }
      ]);

      const dto: LocationHierarchySearchDto = {
        id: '27',
        type: 'state',
        direction: 'child',
        target: ['district'],
        keyword: 'Test'
      };

      await service.hierarchySearch(dto);

      // Verify all queries use parameters
      mockDataSource.query.mock.calls.forEach(call => {
        const [query, params] = call;
        expect(typeof query).toBe('string');
        expect(Array.isArray(params)).toBe(true);
        expect(params.length).toBeGreaterThan(0);
      });
    });
  });
});