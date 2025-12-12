import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Exclude, Expose, Transform, Type } from "class-transformer";

export class filtersProperty {
  @ApiProperty({
    type: String,
    description: "User Id",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
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
    description: "Academic Year Id (comes from headers, not filters)",
    required: false,
  })
  @Exclude()
  @IsOptional()
  academicYearId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "The name of the cohort",
  })
  @IsOptional()
  @Expose()
  @IsString()
  name?: string;

  @ApiProperty({
    type: [String],
    description: "Parent Id",
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  parentId?: string[];

  @ApiProperty({
    type: String,
    description: "The type of the cohort",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    type: [String],
    description: "The status of the cohort",
    default: [],
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

  @ApiProperty({
    type: Object,
    description: "The customFieldsName of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  customFieldsName?: {};
}

enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export class CohortSearchDto {
  @ApiProperty({
    type: Number,
    description: "Limit",
  })
  @IsNumber()
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Offset",
  })
  @IsNumber()
  offset: number;

  @ApiProperty({
    type: filtersProperty,
    description: "Filters",
  })
  @Type(() => filtersProperty)
  @IsObject()
  @ValidateNested()
  filters: filtersProperty;

  @ApiPropertyOptional({
    description: "Sort",
    example: ["name", "asc"],
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  sort?: [string, string];

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, {
    each: true,
    message: "Sort[1] must be either asc or desc",
  })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1] : undefined;
  }

  constructor(partial: Partial<CohortSearchDto>) {
    Object.assign(this, partial);
  }
}