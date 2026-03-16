import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsObject, ValidateNested, IsBoolean, IsEnum } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum PathwayUserSortColumn {
  ACTIVATED_AT = 'activated_at',
  ACTIVATED_AT_CAMEL = 'activatedAt',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  EMAIL = 'email',
  GENDER = 'gender',
  IS_ACTIVE = 'is_active',
}

class ListPathwayUsersFiltersDto {
  @ApiPropertyOptional({
    description: 'Free-text search (matches against firstName, lastName, or email)',
    example: 'John',
  })
  @Expose()
  @IsOptional()
  @IsString()
  search?: string;

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
    enum: PathwayUserSortColumn,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PathwayUserSortColumn)
  column?: PathwayUserSortColumn;

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'DESC',
    enum: SortOrder,
  })
  @Expose()
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder;
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
