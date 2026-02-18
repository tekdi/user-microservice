import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsUUID } from "class-validator";

export class ActivePathwayDto {
  @ApiProperty({
    description: "User ID to fetch active pathway for",
    example: "user-uuid",
    format: "uuid",
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description:
      "Optional Pathway ID. If provided, fetches specific history record for this user and pathway.",
    example: "pathway-uuid",
    format: "uuid",
  })
  @IsUUID()
  @IsOptional()
  pathwayId?: string;
}
