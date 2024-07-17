import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsArray, IsOptional, ValidateIf } from "class-validator";


enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}
export class CohortMembersSearchDto {
  @ApiProperty({
    type: Number,
    description: "Limit",
  })
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Offset",
  })
  offset: number;

  @ApiProperty({
    type: Object,
    description: "Filters",
    example: { cohortId: "", userId: "", role: "" }, // Adding example for Swagger
  })
  @ApiPropertyOptional()
  filters: { cohortId?: string; userId?: string; role?: string }; // Define cohortId and userId properties

  @ApiPropertyOptional({
    description: "Sort",
    example: ["createdAt", "asc"]
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

  constructor(partial: Partial<CohortMembersSearchDto>) {
    Object.assign(this, partial);
  }
}


