import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
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
      "Member being reported. null = general concern (then subject is required)",
  })
  @IsOptional()
  @IsUUID()
  reportedUserId?: string | null;

  @ApiPropertyOptional({ example: "Fake recruiter messages" })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(CONNECT_LIMITS.REPORT_SUBJECT_MAX)
  subject?: string | null;

  @ApiProperty({ enum: CONNECT_REPORT_REASON_KEYS })
  @IsIn(CONNECT_REPORT_REASON_KEYS)
  reason: string;

  @ApiProperty({
    example: "Sent the same promotional message to several members.",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONNECT_LIMITS.REPORT_DETAILS_MAX)
  details: string;
}
