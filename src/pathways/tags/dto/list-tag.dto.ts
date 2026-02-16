import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, IsObject, ValidateNested } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { TagStatus } from '../entities/tag.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';

class TagFiltersDto {
  @ApiPropertyOptional({
    description: 'Filter tags by ID (exact match)',
    example: 'a1b2c3d4-e111-2222-3333-444455556666',
  })
  @Expose()
  @IsOptional()
  @IsUUID(undefined, { message: 'ID must be a valid UUID' })
  id?: string;

  @ApiPropertyOptional({
    description: 'Filter tags by name (partial match, case-insensitive)',
    example: 'Network',
  })
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter tags by status',
    enum: TagStatus,
    example: TagStatus.PUBLISHED,
  })
  @Expose()
  @IsOptional()
  @IsEnum(TagStatus, {
    message: 'Status must be either "published" or "archived"',
  })
  status?: TagStatus;
}

export class ListTagDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filters for tags',
    type: TagFiltersDto,
    example: {
      id: 'a1b2c3d4-e111-2222-3333-444455556666',
      name: 'Network',
      status: 'published',
    },
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TagFiltersDto)
  filters?: TagFiltersDto;
}

