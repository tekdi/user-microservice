import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  IsArray,
  IsUUID,
  IsEnum,
  ValidateIf,
  IsDateString,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PathwayType } from '../entities/pathway.entity';

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
    description: "Image URL (from presigned S3 upload). Upload to S3, then send the returned fileUrl here.",
  })
  @Expose()
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({
    description: 'Array of tag IDs from tags table',
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

  @ApiPropertyOptional({
    description: "Whether the pathway is active",
    example: true,
    default: true,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: "Pathway category type. STANDARD = regular career pathways (one active at a time). VOLUNTEER = volunteer role pathways (multiple can be active simultaneously).",
    enum: PathwayType,
    default: PathwayType.STANDARD,
    example: PathwayType.STANDARD,
  })
  @Expose()
  @IsEnum(PathwayType)
  @IsOptional()
  type?: PathwayType;

  @ApiPropertyOptional({
    description: "Whether a user can hold multiple active assignments of this pathway simultaneously. Must be true for VOLUNTEER type.",
    example: false,
    default: false,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  allow_multiple_active?: boolean;

  @ApiPropertyOptional({
    description: "Volunteer pathway subtype (e.g. CAL, CL, DL). Required when type = VOLUNTEER.",
    example: "CAL",
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @MaxLength(50)
  @ValidateIf((o) => o.type === PathwayType.VOLUNTEER)
  @IsNotEmpty({ message: "subtype is required for VOLUNTEER pathways" })
  @IsOptional()
  subtype?: string;

  @ApiPropertyOptional({
    description: "Datetime until which completed participants are considered current volunteers (batch-level). Applicable for VOLUNTEER type only.",
    example: "2026-12-31T23:59:59Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => o.type === PathwayType.VOLUNTEER || o.volunteer_valid_until !== undefined)
  volunteer_valid_until?: string;

  @ApiPropertyOptional({
    description: "Date from which applications open for this volunteer pathway. Applicable for VOLUNTEER type only.",
    example: "2025-01-01T00:00:00Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => o.type === PathwayType.VOLUNTEER || o.application_opening_date !== undefined)
  application_opening_date?: string;

  @ApiPropertyOptional({
    description: "Date after which applications are no longer accepted for this volunteer pathway. Applicable for VOLUNTEER type only.",
    example: "2025-03-31T23:59:59Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => o.type === PathwayType.VOLUNTEER || o.application_closing_date !== undefined)
  application_closing_date?: string;
}
