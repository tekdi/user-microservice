import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Expose, Type, Transform } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

class ContentFiltersDto {
  @ApiPropertyOptional({
    description: 'Filter by ID (exact match)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  @IsOptional()
  @IsUUID(undefined, { message: 'ID must be a valid UUID' })
  id?: string;

  @ApiPropertyOptional({
    description: 'Filter by name (partial match)',
    example: 'Guide',
  })
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter by alias (partial match)',
    example: 'cricket',
  })
  @Expose()
  @IsOptional()
  @IsString()
  alias?: string;

  @ApiPropertyOptional({
    description: 'Filter by creator UUID',
    example: 'fa023e44-7bcf-43fc-9099-7ca4193a985f',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1) return true;
    if (value === 'false' || value === false || value === 0) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by creation date',
    example: '2026-02-23T06:55:59.080Z',
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  createdAt?: string;
}

export class ListContentDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filters for content list',
    type: ContentFiltersDto,
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ContentFiltersDto)
  filters?: ContentFiltersDto;
}
