import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumberString } from "class-validator";

export class RoleSearchDto {
  @ApiProperty({
    type: String,
    description: "Limit",
  })
  @IsNumberString()
  limit: string;

  @ApiProperty({
    type: Number,
    description: "number",
  })
  page: number;

  @ApiProperty({
    type: Object,
    description: "Filters",
  })
  @ApiPropertyOptional()
  filters: object;

  constructor(partial: Partial<RoleSearchDto>) {
    Object.assign(this, partial);
  }
}
