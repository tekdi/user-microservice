import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsBoolean,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  IsArray,
  IsUUID,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PathwayType } from '../entities/pathway.entity';

export class UpdatePathwayDto {
  @ApiPropertyOptional({
    description: "Display name of the pathway",
    example: "Advanced Career Track",
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Name must not exceed 100 characters" })
  name?: string;

  @ApiPropertyOptional({
    description: "Detailed description of the pathway",
    example: "Advanced skills for corporate leadership",
  })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Image URL (from presigned S3 upload). Replaces existing image; old image is deleted from S3.",
  })
  @Expose()
  @IsOptional()
  @IsString()
  image_url?: string | null;

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
    description: "Display order for sorting pathways",
    example: 2,
    minimum: 0,
  })
  @Expose()
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0, { message: "Display order must be a non-negative number" })
  display_order?: number;

  @ApiPropertyOptional({
    description: "Whether the pathway is active",
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: "Pathway category type (STANDARD or VOLUNTEER).",
    enum: PathwayType,
  })
  @Expose()
  @IsEnum(PathwayType)
  @IsOptional()
  type?: PathwayType;

  @ApiPropertyOptional({
    description: "Whether multiple active assignments are allowed simultaneously.",
    example: true,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  allow_multiple_active?: boolean;

  @ApiPropertyOptional({
    description: "Volunteer pathway subtype (e.g. CAL, CL, DL). Applicable for VOLUNTEER type only.",
    example: "CAL",
    maxLength: 50,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subtype?: string | null;

  @ApiPropertyOptional({
    description: "Datetime until which completed participants are considered current volunteers (batch-level). Pass null to clear.",
    example: "2026-12-31T23:59:59Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  volunteer_valid_until?: string | null;

  @ApiPropertyOptional({
    description: "Date from which applications open. Applicable for VOLUNTEER type only; pass null to clear.",
    example: "2025-01-01T00:00:00Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  application_opening_date?: string | null;

  @ApiPropertyOptional({
    description: "Date after which applications are closed. Applicable for VOLUNTEER type only; pass null to clear.",
    example: "2025-03-31T23:59:59Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  application_closing_date?: string | null;

  @ApiPropertyOptional({
    description: "Date on which a notification should be sent for this pathway. Pass null to clear.",
    example: "2025-03-15T09:00:00Z",
  })
  @Expose()
  @IsOptional()
  @IsDateString()
  notification_date?: string | null;
}
