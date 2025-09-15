import { Expose, Type } from "class-transformer";
import {
  IsOptional,
  IsArray,
  IsUUID,
  IsString,
  IsNumber,
  IsEnum,
  ValidateNested,
  IsObject,
  Min,
  Max,
  IsNotEmpty,
  IsIn,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class LocationFiltersDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Array of State IDs to filter by",
    example: ["state-uuid-1", "state-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  state?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of District IDs to filter by",
    example: ["district-uuid-1", "district-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  district?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Block IDs to filter by",
    example: ["block-uuid-1", "block-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  block?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Village IDs to filter by",
    example: ["village-uuid-1", "village-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  village?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Center IDs to filter by",
    example: ["center-uuid-1", "center-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  center?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Batch/Cohort IDs to filter by",
    example: ["batch-uuid-1", "batch-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  batch?: string[];
}

enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export class HierarchicalLocationFiltersDto {
  @ApiProperty({
    type: Number,
    description: "Number of records to return (pagination)",
    example: 10,
    minimum: 1,
    maximum: 100,
    required: true
  })
  @Expose()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Number of records to skip (pagination)",
    example: 0,
    minimum: 0,
    required: true
  })
  @Expose()
  @IsNumber()
  @Min(0)
  offset: number;

  @ApiProperty({
    type: LocationFiltersDto,
    description: "Location-based filters for hierarchical search",
    required: true
  })
  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationFiltersDto)
  filters: LocationFiltersDto;

  @ApiProperty({
    type: [String],
    description: "Sort configuration [field, direction]. Must be exactly 2 elements: [field, direction]",
    example: ["name", "asc"],
    isArray: true,
    required: true
  })
  @Expose()
  @IsArray()
  @IsString({ each: true })
  sort: [string, string];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of role names to filter users by",
    example: ["Instructor", "Lead", "Content creator", "Content reviewer", "Central Lead", "Super Admin", "State Lead", "Learner"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  role?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of custom field names to include in response",
    example: ["state", "district", "block", "village", "center", "main_subject", "subject"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customfields?: string[];
}