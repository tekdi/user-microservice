import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Min,
} from "class-validator";
import { Expose, Transform, Type } from "class-transformer";

export class GeographicalHierarchyFiltersProperty {
  @ApiPropertyOptional({
    type: [String],
    description: "Parent Id",
  })
  @Expose()
  @IsOptional()
  @IsArray()
  parentId?: string[];

  @ApiPropertyOptional({
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } }
    ],
    description: "Cohort Id - accepts both string or array of UUIDs",
    example: "a4bbca12-35ca-405d-84f5-8622986fdfd2",
  })
  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    
    // Convert string to array
    if (typeof value === "string") {
      return value.trim() === "" ? undefined : [value];
    }
    
    // Keep array as is
    if (Array.isArray(value)) {
      return value.length === 0 ? undefined : value;
    }
    
    return undefined;
  })
  cohortId?: string[];

  @ApiPropertyOptional({
    type: String,
    description: "The name of the cohort",
  })
  @IsOptional()
  @Expose()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    type: String,
    description: "The type of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "The status of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsArray()
  status?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "State",
  })
  @IsOptional()
  @IsArray()
  state?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "District",
  })
  @IsOptional()
  @IsArray()
  district?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Block",
  })
  @IsOptional()
  @IsArray()
  block?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Village",
  })
  @IsOptional()
  @IsArray()
  village?: string[];

  @ApiPropertyOptional({
    type: Object,
    description: "The customFieldsName of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  customFieldsName?: {};
}

export class GeographicalHierarchySearchDto {
  @ApiProperty({
    type: String,
    description: "User Id",
    example: "a4bbca12-35ca-405d-84f5-8622986fdfd2",
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    type: GeographicalHierarchyFiltersProperty,
    description: "Filters for geographical hierarchy",
  })
  @Type(() => GeographicalHierarchyFiltersProperty)
  @IsObject()
  @ValidateNested()
  @IsOptional()
  filters?: GeographicalHierarchyFiltersProperty;

  @ApiPropertyOptional({
    type: Number,
    description: "Limit for pagination",
    default: 100,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "Offset for pagination",
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}
