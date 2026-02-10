import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
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
    description: 'Tags associated with the pathway',
    example: { category: 'professional', level: 'advanced' },
  })
  @Expose()
  @IsOptional()
  tags?: Record<string, any>;

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

