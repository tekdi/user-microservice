import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Maximum allowed limit for pagination to prevent unbounded queries
 * This protects against expensive database queries and performance degradation
 */
export const MAX_PAGINATION_LIMIT = 100;

/**
 * Base DTO for pagination fields (limit and offset)
 * Reusable across list endpoints to avoid duplication
 * Maximum limit of 100 to prevent unbounded queries and performance issues
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
    example: 10,
    minimum: 1,
    maximum: MAX_PAGINATION_LIMIT,
    default: 10,
  })
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(MAX_PAGINATION_LIMIT, {
    message: `Limit cannot exceed ${MAX_PAGINATION_LIMIT}`,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of items to skip for pagination',
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

