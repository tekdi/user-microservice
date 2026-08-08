import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class LocationItemDto {
  @ApiProperty({ description: 'Location ID', example: '27' })
  @Expose()
  id: number;

  @ApiProperty({ description: 'Location name', example: 'West Bengal' })
  @Expose()
  name: string;

  @ApiProperty({ 
    description: 'Location type', 
    enum: ['state', 'district', 'block', 'village'],
    example: 'state' 
  })
  @Expose()
  type: 'state' | 'district' | 'block' | 'village';

  @ApiProperty({ description: 'Parent location ID', example: '10', required: false })
  @Expose()
  parent_id?: number;

  @ApiProperty({ description: 'Whether location is active', example: 1, required: false })
  @Expose()
  is_active?: number;

  @ApiProperty({ description: 'Whether location is found in census', example: 1 })
  @Expose()
  is_found_in_census: number;

  // Optional fields that exist only for state
  @ApiProperty({ description: 'State code (only for states)', example: 'WB', required: false })
  @Expose()
  state_code?: string;
}

export class LocationHierarchyResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ description: 'Response message', example: 'Hierarchy search completed successfully' })
  @Expose()
  message: string;

  @ApiProperty({ 
    description: 'Array of location items matching the search criteria',
    type: [LocationItemDto]
  })
  @Expose()
  data: LocationItemDto[];

  @ApiProperty({ description: 'Total count of results', example: 25 })
  @Expose()
  totalCount: number;

  @ApiProperty({ 
    description: 'Search parameters used for the query',
    example: {
      id: '27',
      type: 'state',
      direction: 'child',
      target: ['village'],
      keyword: 'Naba'
    }
  })
  @Expose()
  searchParams: {
    id: string;
    type: string;
    direction: string;
    target?: string[];
    keyword?: string;
  };
}