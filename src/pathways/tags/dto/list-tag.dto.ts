import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { TagStatus } from '../entities/tag.entity';

export class ListTagDto {
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

  @ApiPropertyOptional({
    description: 'Maximum number of tags to return',
    example: 10,
    minimum: 1,
    default: 10,
  })
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of tags to skip for pagination',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Offset must be an integer' })
  @Min(0, { message: 'Offset must be non-negative' })
  offset?: number;
}

