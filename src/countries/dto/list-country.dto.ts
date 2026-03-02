import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../pathways/common/dto/pagination.dto';

export class ListCountryDto extends PaginationDto {
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
