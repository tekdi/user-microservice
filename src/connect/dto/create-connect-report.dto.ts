import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import {
  CONNECT_LIMITS,
  CONNECT_REPORT_REASON_KEYS,
} from "../constants/connect.constants";

const trim = ({ value }) => (typeof value === "string" ? value.trim() : value);

export class CreateConnectReportDto {
  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    description:
      "connectUserId of the member being reported (from the list / profile). null = general concern (then subject is required)",
  })
  @IsOptional()
  @IsUUID()
  reportedConnectUserId?: string | null;

  @ApiPropertyOptional({ example: "Fake recruiter messages" })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(CONNECT_LIMITS.REPORT_SUBJECT_MAX)
  subject?: string | null;

  @ApiPropertyOptional({
    enum: CONNECT_REPORT_REASON_KEYS,
    description:
      "Required for a general concern. Member safety concern: defaults to safety_concern",
  })
  @IsOptional()
  @IsIn(CONNECT_REPORT_REASON_KEYS)
  reason?: string;

  @ApiPropertyOptional({
    example: "Sent the same promotional message to several members.",
    description: "Required for a general concern. Optional for a member",
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(CONNECT_LIMITS.REPORT_DETAILS_MAX)
  details?: string | null;
}
