import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from "class-validator";
import { Exclude, Expose, Transform, Type } from "class-transformer";

export class filtersProperty {
  //userIdBy
  @ApiProperty({
    type: String,
    description: "User Id",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  userId?: string;

  //cohortIdBy
  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } }
    ],
    description: "Cohort Id - accepts both string (single UUID or empty string) or array (multiple UUIDs or empty array)",
    default: [],
    example: ["", []],
  })
  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    // Handle undefined/null - return undefined for optional field
    if (value === undefined || value === null) {
      return undefined;
    }

    // If already an array, return as is (preserve empty arrays)
    if (Array.isArray(value)) {
      // Filter out null/undefined but keep empty strings in array
      const filtered = value.filter(v => v !== null && v !== undefined);
      return filtered;
    }

    // If single string → convert to array (preserve empty string as empty array)
    if (typeof value === "string") {
      // Empty string → return empty array
      if (value.trim() === "") {
        return [];
      }
      // Non-empty string → wrap in array
      return [value];
    }

    // For any other type, return undefined
    return undefined;
  })
  @ValidateIf((o) => o.cohortId !== undefined && o.cohortId !== null)
  @IsArray({ message: "cohortId must be an array or a string" })
  @ValidateIf((o) => Array.isArray(o.cohortId) && o.cohortId.length > 0)
  @IsNotEmpty({ each: true, message: "Each cohortId must not be empty" })
  @ValidateIf((o) => Array.isArray(o.cohortId) && o.cohortId.length > 0)
  @IsUUID(undefined, { each: true, message: "Each cohortId must be a valid UUID" })
  cohortId?: string[];

  //academicYearId - Note: This comes from headers, not filters. Excluded from processing.
  @ApiPropertyOptional({
    type: String,
    description: "Academic Year Id (comes from headers, not filters)",
    required: false,
  })
  @Exclude()
  @IsOptional()
  academicYearId?: string;

  //name
  @ApiPropertyOptional({
    type: String,
    description: "The name of the cohort",
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Exclude undefined, null, or empty string values
    if (!value || (typeof value === "string" && value.trim() === "")) {
      return undefined;
    }
    return value;
  })
  @Expose()
  @ValidateIf((o) => o.name !== undefined && o.name !== null)
  @IsString()
  @IsNotEmpty()
  name?: string;

  //parentId
  @ApiProperty({
    type: [String],
    description: "Parent Id",
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  parentId?: string[];

  //type
  @ApiProperty({
    type: String,
    description: "The type of the cohort",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  //type
  @ApiProperty({
    type: [String],
    description: "The status of the cohort",
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  status?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "State",
  })
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  state: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "District",
  })
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  district: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Block",
  })
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  block: string[];


  @ApiPropertyOptional({
    type: [String],
    description: "Block",
  })
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  village: string[];

  //customFieldsName
  @ApiProperty({
    type: Object,
    description: "The customFieldsName of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @IsNotEmpty({ each: true })
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
  @Transform(({ value }) => {
    // Remove undefined/null properties from filters object
    // This runs after nested transforms via @Type(), so value is already a filtersProperty instance
    if (value && typeof value === 'object') {
      // Delete undefined/null properties in place to preserve the instance
      Object.keys(value).forEach(key => {
        const val = value[key];
        if (val === undefined || val === null) {
          delete value[key];
        }
      });
    }
    return value;
  })
  @IsObject()
  @ValidateNested()
  filters: filtersProperty;

  @ApiPropertyOptional({
    description: "Sort",
    example: ["name", "asc"],
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: "Sort array must contain exactly two elements" })
  @ArrayMaxSize(2, { message: "Sort array must contain exactly two elements" })
  sort: [string, string];

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
