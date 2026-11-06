import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CONNECT_LIMITS,
  CONNECT_REPORT_REASON_KEYS,
  CONNECT_REPORT_REVIEW_STATUSES,
  ConnectReportStatus,
} from "../constants/connect.constants";

const trim = ({ value }) => (typeof value === "string" ? value.trim() : value);

export class SafetyReportListDto {
  @ApiPropertyOptional({ enum: ConnectReportStatus })
  @IsOptional()
  @IsIn(Object.values(ConnectReportStatus))
  status?: ConnectReportStatus;

  @ApiPropertyOptional({ enum: CONNECT_REPORT_REASON_KEYS })
  @IsOptional()
  @IsIn(CONNECT_REPORT_REASON_KEYS)
  reason?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  reportedUserId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  reporterUserId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: CONNECT_LIMITS.ADMIN_LIST_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONNECT_LIMITS.ADMIN_LIST_MAX_LIMIT)
  limit?: number = CONNECT_LIMITS.ADMIN_LIST_DEFAULT_LIMIT;
}

/** Admin review. A report can't be set back to OPEN */
export class UpdateSafetyReportDto {
  @ApiProperty({ enum: CONNECT_REPORT_REVIEW_STATUSES })
  @IsIn(CONNECT_REPORT_REVIEW_STATUSES)
  status: ConnectReportStatus;

  @ApiPropertyOptional({ example: "Spoke to the member; warning sent." })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;
}
