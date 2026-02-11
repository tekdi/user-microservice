import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Base DTO for pagination fields (limit and offset)
 * Reusable across list endpoints to avoid duplication
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
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

