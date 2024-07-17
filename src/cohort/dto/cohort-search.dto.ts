import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsNumberString, IsObject, IsOptional, IsString, IsUUID, ValidateIf, ValidationArguments, ValidationOptions, registerDecorator } from "class-validator";
import { CohortDto } from "./cohort.dto";
import { Expose } from "class-transformer";

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
    type: String,
    description: "Cohort Id",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  cohortId?: string;

  //name
  @ApiProperty({
    type: String,
    description: "The name of the cohort",
    default: "",
  })
  @Expose()
  @IsOptional()
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
}
enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
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
  @IsObject()
  filters: filtersProperty;

  @ApiPropertyOptional({
    description: "Sort",
    example: ["name", "asc"]
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: 'Sort array must contain exactly two elements' })
  @ArrayMaxSize(2, { message: 'Sort array must contain exactly two elements' })
  sort: [string, string];

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, { each: true, message: 'Sort[1] must be either asc or desc' })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1] : undefined;
  }

  constructor(partial: Partial<CohortSearchDto>) {
    Object.assign(this, partial);
  }
}
