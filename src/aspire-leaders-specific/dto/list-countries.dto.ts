import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsBoolean,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';

export const ASPIRE_LEADERS_COUNTRY_LIST_DEFAULT_LIMIT = 500;
export const ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT = 500;

export class ListCountriesQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of countries to return',
    example: 100,
    minimum: 1,
    maximum: ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT,
    default: ASPIRE_LEADERS_COUNTRY_LIST_DEFAULT_LIMIT,
  })
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT, {
    message: `Limit cannot exceed ${ASPIRE_LEADERS_COUNTRY_LIST_MAX_LIMIT}`,
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

  @ApiPropertyOptional({
    description: 'Filter countries by name (case-insensitive partial match)',
    example: 'India',
    maxLength: 150,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter countries by active status',
    example: true,
  })
  @Expose()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;
}
