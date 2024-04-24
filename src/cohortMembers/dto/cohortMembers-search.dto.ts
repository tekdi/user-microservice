import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CohortMembersSearchDto {
  @ApiProperty({
    type: String,
    description: "Limit",
  })
  limit: string;

  @ApiProperty({
    type: Number,
    description: "Page",
  })
  page: number;

  @ApiProperty({
    type: Object,
    description: "Filters",
    example: { cohortId: "", userId: "" }, // Adding example for Swagger
  })
  @ApiPropertyOptional()
  filters: { cohortId?: string; userId?: string }; // Define cohortId and userId properties

  constructor(partial: Partial<CohortMembersSearchDto>) {
    Object.assign(this, partial);
  }
}
