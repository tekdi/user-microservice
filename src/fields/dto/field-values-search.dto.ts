import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class FieldValuesSearchDto {
  @ApiPropertyOptional({
    type: Number,
    description: "Limit",
    default: 10
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: "Limit must be a number" })
  limit: number = 10;

  @ApiPropertyOptional({
    type: Number,
    description: "Page number",
    default: 1
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: "Page must be a number" })
  page: number = 1;

  @ApiPropertyOptional({
    type: Object,
    description: "Filters",
  })
  filters?: object;

  constructor(partial: Partial<FieldValuesSearchDto>) {
    Object.assign(this, partial);
    // Ensure limit and page are numbers with defaults
    this.limit = partial.limit ? Number(partial.limit) : 10;
    this.page = partial.page ? Number(partial.page) : 1;
  }
}
