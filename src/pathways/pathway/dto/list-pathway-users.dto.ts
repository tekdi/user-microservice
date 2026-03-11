import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsObject, ValidateNested, IsBoolean } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

class ListPathwayUsersFiltersDto {
  @ApiPropertyOptional({
    description: 'Filter by user name (partial match on firstName or lastName)',
    example: 'John',
  })
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter by email (partial match)',
    example: 'john@example.com',
  })
  @Expose()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status in pathway',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

class ListPathwayUsersSortDto {
  @ApiPropertyOptional({
    description: 'Column to sort by',
    example: 'activated_at',
  })
  @Expose()
  @IsOptional()
  @IsString()
  column?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @Expose()
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC';
}

export class ListPathwayUsersDto extends PaginationDto {
  @ApiProperty({
    description: 'Pathway UUID',
    example: 'c3b6e50e-40ab-4148-8ca9-3b2296ca11e5',
  })
  @Expose()
  @IsUUID(undefined, { message: 'pathwayId must be a valid UUID' })
  pathwayId: string;

  @ApiPropertyOptional({
    description: 'Filters for pathway users',
    type: ListPathwayUsersFiltersDto,
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ListPathwayUsersFiltersDto)
  filters?: ListPathwayUsersFiltersDto;

  @ApiPropertyOptional({
    description: 'Sorting options',
    type: ListPathwayUsersSortDto,
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ListPathwayUsersSortDto)
  sort?: ListPathwayUsersSortDto;
}
