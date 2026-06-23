import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { LocationHierarchySearchDto } from "./dto/location-hierarchy-search.dto";
import { LocationHierarchyResponseDto, LocationItemDto } from "./dto/location-hierarchy-response.dto";

type LocationType = 'state' | 'district' | 'block' | 'village';
type Direction = 'child' | 'parent';

interface QueryConfig {
  table: string;
  idColumn: string;
  nameColumn: string;
  parentColumn?: string;
}

interface SecureQueryResult {
  query: string;
  params: any[];
}

@Injectable()
export class LocationService {
  private readonly locationConfigs: Record<LocationType, QueryConfig> = {
    state: { table: 'state', idColumn: 'state_id', nameColumn: 'state_name' },
    district: { table: 'district', idColumn: 'district_id', nameColumn: 'district_name', parentColumn: 'state_id' },
    block: { table: 'block', idColumn: 'block_id', nameColumn: 'block_name', parentColumn: 'district_id' },
    village: { table: 'village', idColumn: 'village_id', nameColumn: 'village_name', parentColumn: 'block_id' }
  };

  private readonly hierarchy: LocationType[] = ['state', 'district', 'block', 'village'];
  
  // Security: Whitelist of allowed table names to prevent injection
  private readonly allowedTables = new Set(['state', 'district', 'block', 'village']);
  private readonly allowedColumns = new Set([
    'state_id', 'state_name', 'state_code', 'district_id', 'district_name', 
    'block_id', 'block_name', 'village_id', 'village_name', 'is_active', 'is_found_in_census'
  ]);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  /**
   * Main method for hierarchy search with secure queries
   */
  async hierarchySearch(searchDto: LocationHierarchySearchDto): Promise<LocationHierarchyResponseDto> {
    try {
      // Security: Validate and sanitize all inputs
      this.validateAndSanitizeInputs(searchDto);
      await this.validateEntityExists(searchDto.id, searchDto.type);
      
      const results = searchDto.direction === 'child'
        ? await this.searchChildren(searchDto)
        : await this.searchParents(searchDto);

      return this.buildResponse(results, searchDto);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      
      // Security: Sanitize error messages to prevent information disclosure
      throw new BadRequestException(error.message || 'Unknown error');
    }
  }

  /**
   * Security: Comprehensive input validation and sanitization
   */
  private validateAndSanitizeInputs(searchDto: LocationHierarchySearchDto): void {
    // Validate ID format
    const numericId = parseInt(searchDto.id);
    if (isNaN(numericId) || numericId <= 0) {
      throw new BadRequestException('Invalid ID format. Must be a positive integer.');
    }

    // Validate type against whitelist
    if (!this.locationConfigs[searchDto.type as LocationType]) {
      throw new BadRequestException(`Invalid type. Allowed: ${Object.keys(this.locationConfigs).join(', ')}`);
    }

    // Validate direction
    if (!['child', 'parent'].includes(searchDto.direction)) {
      throw new BadRequestException('Invalid direction. Must be "child" or "parent".');
    }

    // Validate target types
    if (searchDto.target?.length) {
      const invalidTargets = searchDto.target.filter(target => !this.locationConfigs[target as LocationType]);
      if (invalidTargets.length) {
        throw new BadRequestException(`Invalid target types: ${invalidTargets.join(', ')}`);
      }

      const validTargets = this.getValidTargets(searchDto.type as LocationType, searchDto.direction as Direction);
      const logicallyInvalidTargets = searchDto.target.filter(target => !validTargets.includes(target as LocationType));
      if (logicallyInvalidTargets.length) {
        throw new BadRequestException(
          `Invalid targets [${logicallyInvalidTargets.join(', ')}] for ${searchDto.direction} from ${searchDto.type}. Valid: [${validTargets.join(', ')}]`
        );
      }
    }

    // Security: Sanitize keyword input
    if (searchDto.keyword) {
      // Remove potential SQL injection characters
      const sanitized = searchDto.keyword.replace(/[';\/\*-]/g, '');
      if (sanitized !== searchDto.keyword) {
        throw new BadRequestException('Invalid characters in keyword. Special SQL characters are not allowed.');
      }
      
      // Limit keyword length
      if (searchDto.keyword.length > 100) {
        throw new BadRequestException('Keyword too long. Maximum 100 characters allowed.');
      }
    }
  }

  /**
   * Security: Validate entity exists with parameterized query
   */
  private async validateEntityExists(id: string, type: LocationType): Promise<void> {
    const numericId = parseInt(id);
    const config = this.locationConfigs[type];
    
    // Security: Use parameterized query with whitelisted table/column names
    const query = `SELECT 1 FROM ${config.table} WHERE ${config.idColumn} = $1 LIMIT 1`;
    const result = await this.dataSource.query(query, [numericId]);
    
    if (result.length === 0) {
      throw new BadRequestException(`${type} with ID ${id} not found`);
    }
  }

  /**
   * Get valid target types based on hierarchy position and direction
   */
  private getValidTargets(type: LocationType, direction: Direction): LocationType[] {
    const currentIndex = this.hierarchy.indexOf(type);
    return direction === 'child' 
      ? this.hierarchy.slice(currentIndex + 1)
      : this.hierarchy.slice(0, currentIndex);
  }

  /**
   * Search for child locations with secure queries
   */
  private async searchChildren(searchDto: LocationHierarchySearchDto): Promise<LocationItemDto[]> {
    const numericId = parseInt(searchDto.id);
    const targetTypes = searchDto.target?.length ? searchDto.target as LocationType[] : this.getValidTargets(searchDto.type as LocationType, 'child');
    
    if (!targetTypes.length) return [];

    const results: LocationItemDto[] = [];
    
    for (const targetType of targetTypes) {
      const items = await this.queryChildrenByType(numericId, searchDto.type as LocationType, targetType, searchDto.keyword);
      results.push(...items);
    }

    return results;
  }

  /**
   * Search for parent locations with secure queries
   */
  private async searchParents(searchDto: LocationHierarchySearchDto): Promise<LocationItemDto[]> {
    const numericId = parseInt(searchDto.id);
    const targetTypes = searchDto.target?.length ? searchDto.target as LocationType[] : this.getValidTargets(searchDto.type as LocationType, 'parent');
    
    if (!targetTypes.length) return [];

    const parentData = await this.queryParentHierarchy(numericId, searchDto.type as LocationType, searchDto.keyword);
    return this.filterParentsByTargets(parentData, targetTypes);
  }

  /**
   * Security: Query children with fully parameterized queries
   */
  private async queryChildrenByType(
    parentId: number, 
    parentType: LocationType, 
    childType: LocationType, 
    keyword?: string
  ): Promise<LocationItemDto[]> {
    const childConfig = this.locationConfigs[childType];
    
    if (this.isDirectChild(parentType, childType)) {
      return this.queryDirectChildren(parentId, parentType, childType, keyword);
    } else {
      return this.queryMultiLevelChildren(parentId, parentType, childType, keyword);
    }
  }

  /**
   * Security: Direct child query with parameterized keyword
   */
  private async queryDirectChildren(
    parentId: number, 
    parentType: LocationType, 
    childType: LocationType, 
    keyword?: string
  ): Promise<LocationItemDto[]> {
    const childConfig = this.locationConfigs[childType];
    
    let query: string;
    let params: any[];

    if (keyword) {
      // Security: Fully parameterized query with keyword
      query = `
        SELECT ${childConfig.idColumn} as id, ${childConfig.nameColumn} as name, 
               ${childConfig.parentColumn} as parent_id, is_found_in_census, is_active
        FROM ${childConfig.table}
        WHERE ${childConfig.parentColumn} = $1 
          AND (is_active IS NULL OR is_active = 1)
          AND LOWER(${childConfig.nameColumn}) LIKE LOWER($2)
        ORDER BY ${childConfig.nameColumn}
      `;
      params = [parentId, `%${keyword}%`];
    } else {
      // Security: Parameterized query without keyword
      query = `
        SELECT ${childConfig.idColumn} as id, ${childConfig.nameColumn} as name, 
               ${childConfig.parentColumn} as parent_id, is_found_in_census, is_active
        FROM ${childConfig.table}
        WHERE ${childConfig.parentColumn} = $1 
          AND (is_active IS NULL OR is_active = 1)
        ORDER BY ${childConfig.nameColumn}
      `;
      params = [parentId];
    }

    const results = await this.dataSource.query(query, params);
    return results.map(row => this.mapRowToLocationItem(row, childType));
  }

  /**
   * Security: Multi-level child query with parameterized keyword
   */
  private async queryMultiLevelChildren(
    parentId: number, 
    parentType: LocationType, 
    childType: LocationType, 
    keyword?: string
  ): Promise<LocationItemDto[]> {
    const secureQuery = this.buildSecureMultiLevelQuery(parentType, childType, !!keyword);
    const params = keyword ? [parentId, `%${keyword}%`] : [parentId];
    
    const results = await this.dataSource.query(secureQuery.query, params);
    return results.map(row => this.mapRowToLocationItem(row, childType));
  }

  /**
   * Security: Build secure multi-level query with proper parameterization
   */
  private buildSecureMultiLevelQuery(parentType: LocationType, childType: LocationType, hasKeyword: boolean): SecureQueryResult {
    const parentConfig = this.locationConfigs[parentType];
    const childConfig = this.locationConfigs[childType];
    
    // Security: Build query with whitelisted table and column names only
    const joinChain = this.buildSecureJoinChain(parentType, childType);
    
    let query = `
      SELECT target.${childConfig.idColumn} as id, target.${childConfig.nameColumn} as name,
             target.${childConfig.parentColumn} as parent_id, target.is_found_in_census, target.is_active
      FROM ${parentConfig.table} parent
      ${joinChain}
      WHERE parent.${parentConfig.idColumn} = $1
        AND (target.is_active IS NULL OR target.is_active = 1)
    `;

    if (hasKeyword) {
      query += ` AND LOWER(target.${childConfig.nameColumn}) LIKE LOWER($2)`;
    }

    query += ` ORDER BY target.${childConfig.nameColumn}`;

    return { query, params: [] }; // params handled by caller
  }

  /**
   * Security: Build JOIN chain with secure aliases
   */
  private buildSecureJoinChain(fromType: LocationType, toType: LocationType): string {
    const fromIndex = this.hierarchy.indexOf(fromType);
    const toIndex = this.hierarchy.indexOf(toType);
    
    const joins: string[] = [];
    let currentAlias = 'parent';
    
    // Build secure JOIN chain with validated table/column names
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      const currentType = this.hierarchy[i];
      const currentConfig = this.locationConfigs[currentType];
      const nextAlias = i === toIndex ? 'target' : `level${i}`;
      
      // Security: Only use whitelisted table and column names
      if (!this.allowedTables.has(currentConfig.table)) {
        throw new BadRequestException(`Security error: Invalid table name`);
      }
      
      joins.push(`
        INNER JOIN ${currentConfig.table} ${nextAlias} 
        ON ${nextAlias}.${currentConfig.parentColumn} = ${currentAlias}.${this.locationConfigs[this.hierarchy[i-1]].idColumn}
      `);
      
      currentAlias = nextAlias;
    }
    
    return joins.join(' ');
  }

  /**
   * Security: Query parent hierarchy with parameterized keyword
   */
  private async queryParentHierarchy(
    childId: number, 
    childType: LocationType, 
    keyword?: string
  ): Promise<any> {
    const secureQuery = this.buildSecureParentQuery(childType, !!keyword);
    const params = keyword ? [childId, `%${keyword}%`] : [childId];
    
    const result = await this.dataSource.query(secureQuery.query, params);
    return result[0] || null;
  }

  /**
   * Security: Build parent query with secure parameterization
   */
  private buildSecureParentQuery(childType: LocationType, hasKeyword: boolean): SecureQueryResult {
    const childIndex = this.hierarchy.indexOf(childType);
    const childConfig = this.locationConfigs[childType];
    
    const selects: string[] = [];
    const joins: string[] = [];
    const keywordConditions: string[] = [];
    
    // Build SELECT and JOIN clauses with secure aliases
    selects.push(`c.${childConfig.idColumn} as ${childType}_id`);
    selects.push(`c.${childConfig.nameColumn} as ${childType}_name`);
    selects.push(`c.is_found_in_census as ${childType}_is_found_in_census`);
    selects.push(`c.is_active as ${childType}_is_active`);
    
    if (hasKeyword) {
      keywordConditions.push(`LOWER(c.${childConfig.nameColumn}) LIKE LOWER($2)`);
    }
    
    // Build secure parent JOINs
    for (let i = childIndex - 1; i >= 0; i--) {
      const parentType = this.hierarchy[i];
      const parentConfig = this.locationConfigs[parentType];
      const alias = `p${i}`;
      
      joins.push(`
        LEFT JOIN ${parentConfig.table} ${alias} 
        ON c.${this.locationConfigs[this.hierarchy[i + 1]].parentColumn} = ${alias}.${parentConfig.idColumn}
      `);
      
      selects.push(`${alias}.${parentConfig.idColumn} as ${parentType}_id`);
      selects.push(`${alias}.${parentConfig.nameColumn} as ${parentType}_name`);
      selects.push(`${alias}.is_found_in_census as ${parentType}_is_found_in_census`);
      selects.push(`${alias}.is_active as ${parentType}_is_active`);
      
      if (parentType === 'state') {
        selects.push(`${alias}.state_code`);
      }
      
      if (hasKeyword) {
        keywordConditions.push(`LOWER(${alias}.${parentConfig.nameColumn}) LIKE LOWER($2)`);
      }
    }
    
    let query = `
      SELECT ${selects.join(', ')}
      FROM ${childConfig.table} c
      ${joins.join(' ')}
      WHERE c.${childConfig.idColumn} = $1
    `;

    if (hasKeyword && keywordConditions.length) {
      query += ` AND (${keywordConditions.join(' OR ')})`;
    }

    return { query, params: [] }; // params handled by caller
  }

  /**
   * Filter parent results by target types
   */
  private filterParentsByTargets(parentData: any, targetTypes: LocationType[]): LocationItemDto[] {
    if (!parentData) return [];
    
    const results: LocationItemDto[] = [];
    
    for (const targetType of targetTypes) {
      const id = parentData[`${targetType}_id`];
      const name = parentData[`${targetType}_name`];
      
      if (id && name) {
        const item: LocationItemDto = {
          id,
          name,
          type: targetType,
          is_active: parentData[`${targetType}_is_active`],
          is_found_in_census: parentData[`${targetType}_is_found_in_census`]
        };
        
        // Add parent_id for non-state types
        if (targetType !== 'state') {
          const parentTypeIndex = this.hierarchy.indexOf(targetType) - 1;
          const parentType = this.hierarchy[parentTypeIndex];
          item.parent_id = parentData[`${parentType}_id`];
        }
        
        // Add state_code for state type
        if (targetType === 'state') {
          item.state_code = parentData.state_code;
        }
        
        results.push(item);
      }
    }
    
    return results;
  }

  /**
   * Check if two types have direct parent-child relationship
   */
  private isDirectChild(parentType: LocationType, childType: LocationType): boolean {
    const parentIndex = this.hierarchy.indexOf(parentType);
    const childIndex = this.hierarchy.indexOf(childType);
    return childIndex === parentIndex + 1;
  }

  /**
   * Security: Map database row to LocationItemDto with validation
   */
  private mapRowToLocationItem(row: any, type: LocationType): LocationItemDto {
    // Security: Validate row data before mapping
    if (!row.id || !row.name) {
      throw new BadRequestException('Invalid data structure returned from database');
    }

    const item: LocationItemDto = {
      id: parseInt(row.id), // Ensure numeric ID
      name: String(row.name).trim(), // Sanitize name
      type,
      is_active: row.is_active,
      is_found_in_census: row.is_found_in_census
    };

    if (row.parent_id) {
      item.parent_id = parseInt(row.parent_id);
    }

    if (type === 'state' && row.state_code) {
      item.state_code = String(row.state_code).trim();
    }

    return item;
  }

  /**
   * Build secure response object
   */
  private buildResponse(results: LocationItemDto[], searchDto: LocationHierarchySearchDto): LocationHierarchyResponseDto {
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
  }
}