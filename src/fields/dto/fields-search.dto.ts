import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsUUID, IsNotEmpty, IsNumber, ValidateNested } from "class-validator";

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
  fieldId?: string

  @ApiPropertyOptional()
  @IsString()
  name?: string

  @IsOptional()
  type?: string[]


  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  tenantId?: string


  [key: string]: any;
}

export class FieldsSearchDto {
  @ApiPropertyOptional({
    type: Number,
    description: "Limit",
  })
  @IsOptional()
  @IsNotEmpty()
  @IsNumber({}, { message: 'Limit must be a number' })
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
  filters: FieldsFilterDto

  constructor(partial: Partial<FieldsSearchDto>) {
    Object.assign(this, partial);
  }
}