import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, IsObject, ValidateNested, IsEnum } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PathwayType } from '../entities/pathway.entity';

class PathwayFiltersDto {
  @ApiPropertyOptional({
    description: 'Filter pathways by ID (exact match)',
    example: 'c3b6e50e-40ab-4148-8ca9-3b2296ca11e5',
  })
  @Expose()
  @IsOptional()
  @IsUUID(undefined, { message: 'ID must be a valid UUID' })
  id?: string;

  @ApiPropertyOptional({
    description: 'Filter pathways by name (partial match, case-insensitive)',
    example: 'Career',
  })
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter pathways by description (partial match, case-insensitive)',
    example: 'skills',
  })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Filter pathways by active status",
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Filter pathways by type. Use VOLUNTEER to fetch only volunteer pathways for the 'Become a Volunteer' screen.",
    enum: PathwayType,
    example: PathwayType.VOLUNTEER,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PathwayType)
  type?: PathwayType;
}
export class ListPathwayDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filters for pathways',
    type: PathwayFiltersDto,
    example: {
      id: 'c3b6e50e-40ab-4148-8ca9-3b2296ca11e5',
      name: 'Career',
      description: 'skills',
      isActive: true,
    },
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PathwayFiltersDto)
  filters?: PathwayFiltersDto;
}