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
    example: {
      tenantId: "tenant-uuid",
      isSystemRole: true,
      roleType: "organisation",
    },
    description:
      "Filters. roleType (Task 8): admin | organisation | cohort, or a list. Left out: every type except cohort (group roles)",
  })
  @ApiPropertyOptional()
  filters: object;

  constructor(partial: Partial<RoleSearchDto>) {
    Object.assign(this, partial);
  }
}
