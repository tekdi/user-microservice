import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
  IsArray,
  IsUUID,
} from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdatePathwayDto {
  @ApiPropertyOptional({
    description: 'Display name of the pathway',
    example: 'Advanced Career Track',
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the pathway',
    example: 'Advanced skills for corporate leadership',
  })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of tag IDs from tags table (stored as PostgreSQL text[] array)',
    example: [
      'a1b2c3d4-e111-2222-3333-444455556666',
      'b2c3d4e5-f111-2222-3333-444455556777',
    ],
    type: [String],
  })
  @Expose()
  @IsOptional()
  @IsArray({ message: 'tags must be an array' })
  @IsUUID(undefined, { each: true, message: 'Each tag ID must be a valid UUID' })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Display order for sorting pathways',
    example: 2,
    minimum: 0,
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Display order must be a non-negative number' })
  display_order?: number;

  @ApiPropertyOptional({
    description: 'Whether the pathway is active',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

