import { HttpStatus, Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Location } from "./entities/location.entity";
import { State } from "./entities/state.entity";
import { District } from "./entities/district.entity";
import { Block } from "./entities/block.entity";
import { Village } from "./entities/village.entity";
import { CreateLocationDto } from "./dto/location-create.dto";
import { LocationHierarchySearchDto } from "./dto/location-hierarchy-search.dto";
import { LocationHierarchyResponseDto, LocationItemDto } from "./dto/location-hierarchy-response.dto";
import { error } from "console";
import APIResponse from "src/common/responses/response";
import { Response } from "express";

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectDataSource()
    private dataSource: DataSource
  ) {}

  /**
   * Main method for hierarchy search with support for parent/child traversal, 
   * target filtering, and keyword search
   */
  async hierarchySearch(searchDto: LocationHierarchySearchDto): Promise<LocationHierarchyResponseDto> {
    try {
      // Validate the search parameters
      await this.validateSearchParameters(searchDto);

      let results: LocationItemDto[] = [];

      if (searchDto.direction === 'child') {
        results = await this.searchChildrenOptimized(searchDto);
      } else {
        results = await this.searchParentsOptimized(searchDto);
      }

      return {
        success: true,
        message: 'Hierarchy search completed successfully',
        data: results,
        totalCount: results.length,
        searchParams: {
          id: searchDto.id,
          type: searchDto.type,
          direction: searchDto.direction,
          target: searchDto.target,
          keyword: searchDto.keyword
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Hierarchy search failed: ${error.message}`);
    }
  }

  /**
   * Validate search parameters to ensure they make logical sense
   */
  private async validateSearchParameters(searchDto: LocationHierarchySearchDto): Promise<void> {
    // Check if the ID exists in the specified type
    const entityExists = await this.checkEntityExists(searchDto.id, searchDto.type);
    if (!entityExists) {
      throw new BadRequestException(`${searchDto.type} with ID ${searchDto.id} not found`);
    }

    // Validate target types based on direction and starting type
    if (searchDto.target && searchDto.target.length > 0) {
      const validTargets = this.getValidTargets(searchDto.type, searchDto.direction);
      const invalidTargets = searchDto.target.filter(target => !validTargets.includes(target));
      
      if (invalidTargets.length > 0) {
        throw new BadRequestException(
          `Invalid target types [${invalidTargets.join(', ')}] for direction '${searchDto.direction}' from type '${searchDto.type}'. Valid targets: [${validTargets.join(', ')}]`
        );
      }
    }
  }

  /**
   * Check if an entity exists in the specified type using raw SQL
   */
  private async checkEntityExists(id: string, type: string): Promise<boolean> {
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      return false;
    }

    let query: string;
    switch (type) {
      case 'state':
        query = 'SELECT 1 FROM state WHERE state_id = $1 LIMIT 1';
        break;
      case 'district':
        query = 'SELECT 1 FROM district WHERE district_id = $1 LIMIT 1';
        break;
      case 'block':
        query = 'SELECT 1 FROM block WHERE block_id = $1 LIMIT 1';
        break;
      case 'village':
        query = 'SELECT 1 FROM village WHERE village_id = $1 LIMIT 1';
        break;
      default:
        return false;
    }

    const result = await this.dataSource.query(query, [numericId]);
    return result.length > 0;
  }

  /**
   * Get valid target types based on starting type and direction
   */
  private getValidTargets(type: string, direction: string): string[] {
    const hierarchy = ['state', 'district', 'block', 'village'];
    const currentIndex = hierarchy.indexOf(type);

    if (direction === 'child') {
      return hierarchy.slice(currentIndex + 1);
    } else {
      return hierarchy.slice(0, currentIndex);
    }
  }

  /**
   * Search for child locations based on the search parameters - OPTIMIZED VERSION
   */
  private async searchChildrenOptimized(searchDto: LocationHierarchySearchDto): Promise<LocationItemDto[]> {
    const numericId = parseInt(searchDto.id);
    const targets = searchDto.target || [];
    const keyword = searchDto.keyword?.trim().toLowerCase() || '';

    // Build keyword filter for SQL (parameterized to prevent SQL injection)
    const keywordFilterTemplate = keyword ? `AND LOWER({{name_column}}) LIKE LOWER($2)` : '';
    const keywordParam = keyword ? `%${keyword}%` : null;
    
    let results: LocationItemDto[] = [];

    switch (searchDto.type) {
      case 'state':
        results = await this.getChildrenFromStateOptimized(numericId, targets, keywordFilterTemplate, keywordParam);
        break;
      case 'district':
        results = await this.getChildrenFromDistrictOptimized(numericId, targets, keywordFilterTemplate, keywordParam);
        break;
      case 'block':
        results = await this.getChildrenFromBlockOptimized(numericId, targets, keywordFilterTemplate, keywordParam);
        break;
      case 'village':
        // Village has no children
        results = [];
        break;
    }

    return results;
  }

  /**
   * Search for parent locations based on the search parameters - OPTIMIZED VERSION
   */
  private async searchParentsOptimized(searchDto: LocationHierarchySearchDto): Promise<LocationItemDto[]> {
    const numericId = parseInt(searchDto.id);
    const targets = searchDto.target || [];
    const keyword = searchDto.keyword?.trim().toLowerCase() || '';

    let results: LocationItemDto[] = [];

    switch (searchDto.type) {
      case 'state':
        // State has no parents
        results = [];
        break;
      case 'district':
        results = await this.getParentsFromDistrictOptimized(numericId, targets, keyword);
        break;
      case 'block':
        results = await this.getParentsFromBlockOptimized(numericId, targets, keyword);
        break;
      case 'village':
        results = await this.getParentsFromVillageOptimized(numericId, targets, keyword);
        break;
    }

    return results;
  }

  /**
   * OPTIMIZED: Get children from state - only fetch requested target types with keyword filtering
   */
  private async getChildrenFromStateOptimized(stateId: number, targets: string[], keywordFilter: string, keywordParam: string | null): Promise<LocationItemDto[]> {
    const results: LocationItemDto[] = [];
    
    // If no targets specified, get all child types
    const targetTypes = targets.length > 0 ? targets : ['district', 'block', 'village'];

    // Only query districts if needed
    if (targetTypes.includes('district')) {
      const districtFilter = keywordFilter.replace('{{name_column}}', 'district_name');
      const districtQuery = `
        SELECT district_id, district_name, state_id, is_found_in_census, is_active
        FROM district 
        WHERE state_id = $1 AND (is_active IS NULL OR is_active = 1) ${districtFilter}
        ORDER BY district_name
      `;
      const queryParams = keywordParam ? [stateId, keywordParam] : [stateId];
      const districts = await this.dataSource.query(districtQuery, queryParams);
      
      districts.forEach(district => {
        results.push({
          id: district.district_id,
          name: district.district_name,
          type: 'district',
          parent_id: district.state_id,
          is_active: district.is_active,
          is_found_in_census: district.is_found_in_census
        });
      });
    }

    // Only query blocks if needed (and if districts were found or no keyword filter)
    if (targetTypes.includes('block')) {
      const blockFilter = keywordFilter.replace('{{name_column}}', 'block_name');
      const blockQuery = `
        SELECT b.block_id, b.block_name, b.district_id, b.is_found_in_census, b.is_active
        FROM block b
        INNER JOIN district d ON b.district_id = d.district_id
        WHERE d.state_id = $1 
          AND (b.is_active IS NULL OR b.is_active = 1) 
          AND (d.is_active IS NULL OR d.is_active = 1) ${blockFilter}
        ORDER BY b.block_name
      `;
      const queryParams = keywordParam ? [stateId, keywordParam] : [stateId];
      const blocks = await this.dataSource.query(blockQuery, queryParams);
      
      blocks.forEach(block => {
        results.push({
          id: block.block_id,
          name: block.block_name,
          type: 'block',
          parent_id: block.district_id,
          is_active: block.is_active,
          is_found_in_census: block.is_found_in_census
        });
      });
    }

    // Only query villages if needed
    if (targetTypes.includes('village')) {
      const villageFilter = keywordFilter.replace('{{name_column}}', 'village_name');
      const villageQuery = `
        SELECT v.village_id, v.village_name, v.block_id, v.is_found_in_census, v.is_active
        FROM village v
        INNER JOIN block b ON v.block_id = b.block_id
        INNER JOIN district d ON b.district_id = d.district_id
        WHERE d.state_id = $1 
          AND (v.is_active IS NULL OR v.is_active = 1) 
          AND (b.is_active IS NULL OR b.is_active = 1) 
          AND (d.is_active IS NULL OR d.is_active = 1) ${villageFilter}
        ORDER BY v.village_name
      `;
      const queryParams = keywordParam ? [stateId, keywordParam] : [stateId];
      const villages = await this.dataSource.query(villageQuery, queryParams);
      
      villages.forEach(village => {
        results.push({
          id: village.village_id,
          name: village.village_name,
          type: 'village',
          parent_id: village.block_id,
          is_active: village.is_active,
          is_found_in_census: village.is_found_in_census
        });
      });
    }

    return results;
  }

  /**
   * OPTIMIZED: Get children from district - only fetch requested target types with keyword filtering
   */
  private async getChildrenFromDistrictOptimized(districtId: number, targets: string[], keywordFilter: string, keywordParam: string | null): Promise<LocationItemDto[]> {
    const results: LocationItemDto[] = [];
    const targetTypes = targets.length > 0 ? targets : ['block', 'village'];

    // Only query blocks if needed
    if (targetTypes.includes('block')) {
      const blockFilter = keywordFilter.replace('{{name_column}}', 'block_name');
      const blockQuery = `
        SELECT block_id, block_name, district_id, is_found_in_census, is_active
        FROM block 
        WHERE district_id = $1 AND (is_active IS NULL OR is_active = 1) ${blockFilter}
        ORDER BY block_name
      `;
      const queryParams = keywordParam ? [districtId, keywordParam] : [districtId];
      const blocks = await this.dataSource.query(blockQuery, queryParams);
      
      blocks.forEach(block => {
        results.push({
          id: block.block_id,
          name: block.block_name,
          type: 'block',
          parent_id: block.district_id,
          is_active: block.is_active,
          is_found_in_census: block.is_found_in_census
        });
      });
    }

    // Only query villages if needed
    if (targetTypes.includes('village')) {
      const villageFilter = keywordFilter.replace('{{name_column}}', 'village_name');
      const villageQuery = `
        SELECT v.village_id, v.village_name, v.block_id, v.is_found_in_census, v.is_active
        FROM village v
        INNER JOIN block b ON v.block_id = b.block_id
        WHERE b.district_id = $1 
          AND (v.is_active IS NULL OR v.is_active = 1) 
          AND (b.is_active IS NULL OR b.is_active = 1) ${villageFilter}
        ORDER BY v.village_name
      `;
      const queryParams = keywordParam ? [districtId, keywordParam] : [districtId];
      const villages = await this.dataSource.query(villageQuery, queryParams);
      
      villages.forEach(village => {
        results.push({
          id: village.village_id,
          name: village.village_name,
          type: 'village',
          parent_id: village.block_id,
          is_active: village.is_active,
          is_found_in_census: village.is_found_in_census
        });
      });
    }

    return results;
  }

  /**
   * OPTIMIZED: Get children from block - only villages with keyword filtering
   */
  private async getChildrenFromBlockOptimized(blockId: number, targets: string[], keywordFilter: string, keywordParam: string | null): Promise<LocationItemDto[]> {
    const targetTypes = targets.length > 0 ? targets : ['village'];
    
    if (!targetTypes.includes('village')) {
      return []; // Block only has village children
    }

    const villageFilter = keywordFilter.replace('{{name_column}}', 'village_name');
    const villageQuery = `
      SELECT village_id, village_name, block_id, is_found_in_census, is_active
      FROM village 
      WHERE block_id = $1 AND (is_active IS NULL OR is_active = 1) ${villageFilter}
      ORDER BY village_name
    `;
    const queryParams = keywordParam ? [blockId, keywordParam] : [blockId];
    const villages = await this.dataSource.query(villageQuery, queryParams);

    return villages.map(village => ({
      id: village.village_id,
      name: village.village_name,
      type: 'village' as const,
      parent_id: village.block_id,
      is_active: village.is_active,
      is_found_in_census: village.is_found_in_census
    }));
  }

  /**
   * OPTIMIZED: Get parents with target and keyword filtering
   */
  private async getParentsFromVillageOptimized(villageId: number, targets: string[], keyword: string): Promise<LocationItemDto[]> {
    const targetTypes = targets.length > 0 ? targets : ['block', 'district', 'state'];
    const keywordFilter = keyword ? `AND (
      LOWER(b.block_name) LIKE LOWER('%${keyword}%') OR
      LOWER(d.district_name) LIKE LOWER('%${keyword}%') OR  
      LOWER(s.state_name) LIKE LOWER('%${keyword}%')
    )` : '';

    const query = `
      SELECT 
        v.village_id, v.village_name, v.block_id, v.is_found_in_census as v_is_found_in_census, v.is_active as v_is_active,
        b.block_name, b.district_id, b.is_found_in_census as b_is_found_in_census, b.is_active as b_is_active,
        d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM village v
      LEFT JOIN block b ON v.block_id = b.block_id
      LEFT JOIN district d ON b.district_id = d.district_id  
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE v.village_id = $1 ${keywordFilter}
    `;

    const result = await this.dataSource.query(query, [villageId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add block if requested
    if (targetTypes.includes('block') && row.block_id) {
      parents.push({
        id: row.block_id,
        name: row.block_name,
        type: 'block',
        parent_id: row.district_id,
        is_active: row.b_is_active,
        is_found_in_census: row.b_is_found_in_census
      });
    }

    // Add district if requested
    if (targetTypes.includes('district') && row.district_id) {
      parents.push({
        id: row.district_id,
        name: row.district_name,
        type: 'district',
        parent_id: row.state_id,
        is_active: row.d_is_active,
        is_found_in_census: row.d_is_found_in_census
      });
    }

    // Add state if requested
    if (targetTypes.includes('state') && row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  private async getParentsFromBlockOptimized(blockId: number, targets: string[], keyword: string): Promise<LocationItemDto[]> {
    const targetTypes = targets.length > 0 ? targets : ['block', 'district', 'state'];
    const keywordFilter = keyword ? `AND (
      LOWER(b.block_name) LIKE LOWER('%${keyword}%') OR
      LOWER(d.district_name) LIKE LOWER('%${keyword}%') OR  
      LOWER(s.state_name) LIKE LOWER('%${keyword}%')
    )` : '';

    const query = `
      SELECT 
        b.block_id, b.block_name, b.district_id, b.is_found_in_census as b_is_found_in_census, b.is_active as b_is_active,
        d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM block b
      LEFT JOIN district d ON b.district_id = d.district_id  
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE b.block_id = $1 ${keywordFilter}
    `;

    const result = await this.dataSource.query(query, [blockId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add block itself if requested
    if (targetTypes.includes('block')) {
      parents.push({
        id: row.block_id,
        name: row.block_name,
        type: 'block',
        parent_id: row.district_id,
        is_active: row.b_is_active,
        is_found_in_census: row.b_is_found_in_census
      });
    }

    // Add district if requested
    if (targetTypes.includes('district') && row.district_id) {
      parents.push({
        id: row.district_id,
        name: row.district_name,
        type: 'district',
        parent_id: row.state_id,
        is_active: row.d_is_active,
        is_found_in_census: row.d_is_found_in_census
      });
    }

    // Add state if requested
    if (targetTypes.includes('state') && row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  private async getParentsFromDistrictOptimized(districtId: number, targets: string[], keyword: string): Promise<LocationItemDto[]> {
    const targetTypes = targets.length > 0 ? targets : ['district', 'state'];
    const keywordFilter = keyword ? `AND (
      LOWER(d.district_name) LIKE LOWER('%${keyword}%') OR  
      LOWER(s.state_name) LIKE LOWER('%${keyword}%')
    )` : '';

    const query = `
      SELECT 
        d.district_id, d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM district d
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE d.district_id = $1 ${keywordFilter}
    `;

    const result = await this.dataSource.query(query, [districtId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add district itself if requested
    if (targetTypes.includes('district')) {
      parents.push({
        id: row.district_id,
        name: row.district_name,
        type: 'district',
        parent_id: row.state_id,
        is_active: row.d_is_active,
        is_found_in_census: row.d_is_found_in_census
      });
    }

    // Add state if requested
    if (targetTypes.includes('state') && row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  /**
   * Get all children (districts, blocks, villages) from a state using raw SQL
   */
  private async getChildrenFromState(stateId: number): Promise<LocationItemDto[]> {
    const results: LocationItemDto[] = [];

    // Get all districts under this state
    const districtQuery = `
      SELECT district_id, district_name, state_id, is_found_in_census, is_active
      FROM district 
      WHERE state_id = $1 AND (is_active IS NULL OR is_active = 1)
    `;
    const districts = await this.dataSource.query(districtQuery, [stateId]);

    for (const district of districts) {
      results.push({
        id: district.district_id,
        name: district.district_name,
        type: 'district',
        parent_id: district.state_id,
        is_active: district.is_active,
        is_found_in_census: district.is_found_in_census
      });

      // Get all blocks under this district
      const blockQuery = `
        SELECT block_id, block_name, district_id, is_found_in_census, is_active
        FROM block 
        WHERE district_id = $1 AND (is_active IS NULL OR is_active = 1)
      `;
      const blocks = await this.dataSource.query(blockQuery, [district.district_id]);

      for (const block of blocks) {
        results.push({
          id: block.block_id,
          name: block.block_name,
          type: 'block',
          parent_id: block.district_id,
          is_active: block.is_active,
          is_found_in_census: block.is_found_in_census
        });

        // Get all villages under this block
        const villageQuery = `
          SELECT village_id, village_name, block_id, is_found_in_census, is_active
          FROM village 
          WHERE block_id = $1 AND (is_active IS NULL OR is_active = 1)
        `;
        const villages = await this.dataSource.query(villageQuery, [block.block_id]);

        for (const village of villages) {
          results.push({
            id: village.village_id,
            name: village.village_name,
            type: 'village',
            parent_id: village.block_id,
            is_active: village.is_active,
            is_found_in_census: village.is_found_in_census
          });
        }
      }
    }

    return results;
  }

  /**
   * Get all children (blocks, villages) from a district using raw SQL
   */
  private async getChildrenFromDistrict(districtId: number): Promise<LocationItemDto[]> {
    const results: LocationItemDto[] = [];

    // Get all blocks under this district
    const blockQuery = `
      SELECT block_id, block_name, district_id, is_found_in_census, is_active
      FROM block 
      WHERE district_id = $1 AND (is_active IS NULL OR is_active = 1)
    `;
    const blocks = await this.dataSource.query(blockQuery, [districtId]);

    for (const block of blocks) {
      results.push({
        id: block.block_id,
        name: block.block_name,
        type: 'block',
        parent_id: block.district_id,
        is_active: block.is_active,
        is_found_in_census: block.is_found_in_census
      });

      // Get all villages under this block
      const villageQuery = `
        SELECT village_id, village_name, block_id, is_found_in_census, is_active
        FROM village 
        WHERE block_id = $1 AND (is_active IS NULL OR is_active = 1)
      `;
      const villages = await this.dataSource.query(villageQuery, [block.block_id]);

      for (const village of villages) {
        results.push({
          id: village.village_id,
          name: village.village_name,
          type: 'village',
          parent_id: village.block_id,
          is_active: village.is_active,
          is_found_in_census: village.is_found_in_census
        });
      }
    }

    return results;
  }

  /**
   * Get all children (villages) from a block using raw SQL
   */
  private async getChildrenFromBlock(blockId: number): Promise<LocationItemDto[]> {
    const villageQuery = `
      SELECT village_id, village_name, block_id, is_found_in_census, is_active
      FROM village 
      WHERE block_id = $1 AND (is_active IS NULL OR is_active = 1)
    `;
    const villages = await this.dataSource.query(villageQuery, [blockId]);

    return villages.map(village => ({
      id: village.village_id,
      name: village.village_name,
      type: 'village' as const,
      parent_id: village.block_id,
      is_active: village.is_active,
      is_found_in_census: village.is_found_in_census
    }));
  }

  /**
   * Get all parents (state, district, block) from a village using raw SQL
   */
  private async getParentsFromVillage(villageId: number): Promise<LocationItemDto[]> {
    // Use a single JOIN query to get all parent hierarchy
    const query = `
      SELECT 
        v.village_id, v.village_name, v.block_id, v.is_found_in_census as v_is_found_in_census, v.is_active as v_is_active,
        b.block_name, b.district_id, b.is_found_in_census as b_is_found_in_census, b.is_active as b_is_active,
        d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM village v
      LEFT JOIN block b ON v.block_id = b.block_id
      LEFT JOIN district d ON b.district_id = d.district_id  
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE v.village_id = $1
    `;

    const result = await this.dataSource.query(query, [villageId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add block
    if (row.block_id) {
      parents.push({
        id: row.block_id,
        name: row.block_name,
        type: 'block',
        parent_id: row.district_id,
        is_active: row.b_is_active,
        is_found_in_census: row.b_is_found_in_census
      });
    }

    // Add district  
    if (row.district_id) {
      parents.push({
        id: row.district_id,
        name: row.district_name,
        type: 'district',
        parent_id: row.state_id,
        is_active: row.d_is_active,
        is_found_in_census: row.d_is_found_in_census
      });
    }

    // Add state
    if (row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  /**
   * Get all parents (state, district) from a block using raw SQL
   */
  private async getParentsFromBlock(blockId: number): Promise<LocationItemDto[]> {
    // Use a single JOIN query to get block and its parents
    const query = `
      SELECT 
        b.block_id, b.block_name, b.district_id, b.is_found_in_census as b_is_found_in_census, b.is_active as b_is_active,
        d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM block b
      LEFT JOIN district d ON b.district_id = d.district_id  
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE b.block_id = $1
    `;

    const result = await this.dataSource.query(query, [blockId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add block itself
    parents.push({
      id: row.block_id,
      name: row.block_name,
      type: 'block',
      parent_id: row.district_id,
      is_active: row.b_is_active,
      is_found_in_census: row.b_is_found_in_census
    });

    // Add district  
    if (row.district_id) {
      parents.push({
        id: row.district_id,
        name: row.district_name,
        type: 'district',
        parent_id: row.state_id,
        is_active: row.d_is_active,
        is_found_in_census: row.d_is_found_in_census
      });
    }

    // Add state
    if (row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  /**
   * Get all parents (state) from a district using raw SQL
   */
  private async getParentsFromDistrict(districtId: number): Promise<LocationItemDto[]> {
    // Use a single JOIN query to get district and its parent state
    const query = `
      SELECT 
        d.district_id, d.district_name, d.state_id, d.is_found_in_census as d_is_found_in_census, d.is_active as d_is_active,
        s.state_name, s.state_code, s.is_found_in_census as s_is_found_in_census, s.is_active as s_is_active
      FROM district d
      LEFT JOIN state s ON d.state_id = s.state_id
      WHERE d.district_id = $1
    `;

    const result = await this.dataSource.query(query, [districtId]);
    
    if (result.length === 0) return [];

    const row = result[0];
    const parents: LocationItemDto[] = [];

    // Add district itself
    parents.push({
      id: row.district_id,
      name: row.district_name,
      type: 'district',
      parent_id: row.state_id,
      is_active: row.d_is_active,
      is_found_in_census: row.d_is_found_in_census
    });

    // Add state
    if (row.state_id) {
      parents.push({
        id: row.state_id,
        name: row.state_name,
        type: 'state',
        is_active: row.s_is_active,
        is_found_in_census: row.s_is_found_in_census,
        state_code: row.state_code
      });
    }

    return parents;
  }

  // Mapping methods removed - using direct mapping in raw SQL queries

  // Legacy methods - keeping for backward compatibility
  async create(
    createLocationDto: CreateLocationDto,
    response: Response
  ): Promise<Response> {
    const apiId = "api.create.location";
    try {
      const location = this.locationRepository.create(createLocationDto);
      const result = await this.locationRepository.save(location);
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Location created successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  //API to find location using Id
  async findLocation(id: string, response): Promise<Response> {
    const apiId = "api.find.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        response,
        apiId,
        location,
        HttpStatus.OK,
        "Location found successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //API for update
  async update(
    id: string,
    updateLocationDto: any,
    response
  ): Promise<Response> {
    const apiId = "api.update.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      await this.locationRepository.update(id, updateLocationDto);
      return APIResponse.success(
        response,
        apiId,
        null,
        HttpStatus.OK,
        "Location updated successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //API for delete
  async remove(id: string, response: Response): Promise<Response> {
    const apiId = "api.delete.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      await this.locationRepository.delete(id);
      return APIResponse.success(
        response,
        apiId,
        null,
        HttpStatus.OK,
        "Location deleted successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async filter(reqObj: any, response): Promise<Response> {
    const apiId = "api.filter.location";
    try {
      const query = this.locationRepository.createQueryBuilder("location");
      if (Object.keys(reqObj.filters).length == 0) {
        query.limit(reqObj.limit).offset(reqObj.offset);
        const allLocations = await query.getMany();
        return APIResponse.success(
          response,
          apiId,
          allLocations,
          HttpStatus.OK,
          "All locations retrieved successfully"
        );
      }

      Object.keys(reqObj.filters).forEach((key) => {
        if (reqObj.filters[key]) {
          query.andWhere(`location.${key} = :${key}`, {
            [key]: reqObj.filters[key],
          });
        }
      });
      query.limit(reqObj.limit).offset(reqObj.offset);
      const result = await query.getMany();
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Location filtered successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
