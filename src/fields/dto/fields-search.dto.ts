import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsUUID,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateIf,
  IsEnum,
} from "class-validator";

export class FieldsFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  context?: string;

  @IsString()
  @IsOptional()
  contextType?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  fieldId?: string;

  @ApiPropertyOptional()
  @IsString()
  name?: string;

  @IsOptional()
  type?: string[];

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  [key: string]: any;
}

export class FieldsSearchDto {
  @ApiPropertyOptional({
    type: Number,
    description: "Limit",
  })
  @IsOptional()
  @IsNotEmpty()
  @IsNumber({}, { message: "Limit must be a number" })
  limit: number;

  @ApiProperty({
    type: Number,
    description: "number",
  })
  offset: number;

  @ApiPropertyOptional({
    type: FieldsFilterDto,
    description: "Filters",
  })
  @ValidateNested({ each: true })
  @Type(() => FieldsFilterDto)
  filters: FieldsFilterDto;

  constructor(partial: Partial<FieldsSearchDto>) {
    Object.assign(this, partial);
  }
}

enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

//Filters for getting field Options list.
export class FieldsOptionsSearchDto {
  @ApiPropertyOptional({ type: () => Number })
  @IsOptional()
  @IsNumber({}, { message: "Limit must be a number" })
  @Expose()
  limit: number;

  @ApiPropertyOptional({ type: () => Number })
  @IsOptional()
  @IsNumber({}, { message: "Offset must be a number" })
  @Expose()
  offset: number;

  @ApiProperty({ type: () => String })
  @Expose()
  @IsNotEmpty()
  fieldName: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsNotEmpty()
  @Expose()
  controllingfieldfk: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsNotEmpty()
  @Expose()
  context: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsNotEmpty()
  @Expose()
  contextType: string;

  //Search By options
  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsNotEmpty()
  @Expose()
  optionName: string;

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

  constructor(partial: Partial<FieldsSearchDto>) {
    Object.assign(this, partial);
  }
}
