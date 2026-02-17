import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
  IsArray,
  IsUUID,
} from 'class-validator';
import { Expose, Type, Transform } from 'class-transformer';

export class CreatePathwayDto {
  @ApiProperty({
    description: "Unique key identifier for the pathway",
    example: "career_dev",
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: "Key must not exceed 50 characters" })
  key: string;

  @ApiProperty({
    description: "Display name of the pathway",
    example: "Career Development",
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: "Name must not exceed 100 characters" })
  name: string;

  @ApiPropertyOptional({
    description: "Detailed description of the pathway",
    example: "Build skills for corporate success",
  })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Image URL (from presigned S3 upload). upload to S3, then send the returned fileUrl here.",
  })
  @Expose()
  @IsOptional()
  @IsString()
  image_url?: string;

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
    description: "Display order for sorting pathways (auto-incremented if not provided)",
    example: 1,
    minimum: 0,
  })
  @Expose()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0, { message: "Display order must be a non-negative number" })
  display_order?: number;

  @ApiProperty({
    description: "Whether the pathway is active",
    example: true,
    default: true,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
