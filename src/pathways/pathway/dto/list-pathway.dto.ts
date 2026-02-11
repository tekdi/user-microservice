import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsInt, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class ListPathwayDto {
  @ApiPropertyOptional({
    description: 'Filter pathways by active status',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of pathways to return',
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
    description: 'Number of pathways to skip for pagination',
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

