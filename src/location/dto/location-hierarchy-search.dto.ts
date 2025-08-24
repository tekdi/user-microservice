import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsIn, 
  IsOptional, 
  IsArray, 
  ArrayMinSize, 
  ValidateIf 
} from 'class-validator';
import { Expose } from 'class-transformer';

export class LocationHierarchySearchDto {
  @ApiProperty({
    description: 'ID of the location entity to start the hierarchy search from',
    example: '27',
    type: String
  })
  @Expose()
  @IsNotEmpty({ message: 'ID is required' })
  @IsString({ message: 'ID must be a string' })
  id: string;

  @ApiProperty({
    description: 'Type of the location entity corresponding to the provided ID',
    enum: ['state', 'district', 'block', 'village'],
    example: 'state'
  })
  @Expose()
  @IsNotEmpty({ message: 'Type is required' })
  @IsString({ message: 'Type must be a string' })
  @IsIn(['state', 'district', 'block', 'village'], { 
    message: 'Type must be one of: state, district, block, village' 
  })
  type: 'state' | 'district' | 'block' | 'village';

  @ApiProperty({
    description: 'Direction of hierarchy traversal',
    enum: ['child', 'parent'],
    example: 'child'
  })
  @Expose()
  @IsNotEmpty({ message: 'Direction is required' })
  @IsString({ message: 'Direction must be a string' })
  @IsIn(['child', 'parent'], { 
    message: 'Direction must be either "child" or "parent"' 
  })
  direction: 'child' | 'parent';

  @ApiPropertyOptional({
    description: 'Specific target levels to return in the hierarchy. If not provided, returns all levels in the direction.',
    type: [String],
    enum: ['state', 'district', 'block', 'village'],
    example: ['village']
  })
  @Expose()
  @IsOptional()
  @IsArray({ message: 'Target must be an array' })
  @ArrayMinSize(1, { message: 'Target array must contain at least one element' })
  @IsString({ each: true, message: 'Each target element must be a string' })
  @IsIn(['state', 'district', 'block', 'village'], { 
    each: true, 
    message: 'Each target must be one of: state, district, block, village' 
  })
  target?: ('state' | 'district' | 'block' | 'village')[];

  @ApiPropertyOptional({
    description: 'Keyword to search for in location names. Case-insensitive partial match.',
    example: 'Naba'
  })
  @Expose()
  @IsOptional()
  @IsString({ message: 'Keyword must be a string' })
  @ValidateIf(o => o.keyword !== undefined && o.keyword !== null && o.keyword !== '')
  keyword?: string;
}