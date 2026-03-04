import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../pathways/common/dto/pagination.dto';

/** Maximum limit for country list (higher than default pagination to allow full country lists) */
export const COUNTRY_LIST_MAX_LIMIT = 250;

export class ListCountryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Maximum number of countries to return',
    example: 10,
    minimum: 1,
    maximum: COUNTRY_LIST_MAX_LIMIT,
    default: 10,
  })
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(COUNTRY_LIST_MAX_LIMIT, {
    message: `Limit cannot exceed ${COUNTRY_LIST_MAX_LIMIT}`,
  })
  limit?: number;

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
