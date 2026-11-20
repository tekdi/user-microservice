import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CONNECT_LIMITS,
  ConnectReportStatus,
  ConnectReportType,
} from "../constants/connect.constants";

const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "must be a date like 2026-11-30";

/** Trims each entry and drops empty ones */
const trimList = ({ value }) =>
  Array.isArray(value)
    ? value
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== "")
    : value;

export class ConnectReportFiltersDto {
  @ApiPropertyOptional({
    type: [String],
    example: ["India", "Kenya"],
    description:
      "active_members / left_members: Users.currentCountry, case-insensitive",
  })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(CONNECT_LIMITS.REPORT_EXPORT_MAX_COUNTRIES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  countries?: string[];

  @ApiPropertyOptional({
    enum: ConnectReportStatus,
    isArray: true,
    description: "reported_members only",
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(ConnectReportStatus), { each: true })
  statuses?: ConnectReportStatus[];

  @ApiPropertyOptional({
    example: "2026-01-01",
    description:
      "From this day (UTC, included): joinedAt / leftAt / report createdAt",
  })
  @IsOptional()
  @Matches(DAY_REGEX, { message: `from ${DAY_MESSAGE}` })
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: "2026-11-30",
    description: "To this day (UTC, included)",
  })
  @IsOptional()
  @Matches(DAY_REGEX, { message: `to ${DAY_MESSAGE}` })
  @IsDateString()
  to?: string;
}

/** B9 POST /connect/admin/reports */
export class ConnectReportDto {
  @ApiProperty({ enum: ConnectReportType })
  @IsIn(Object.values(ConnectReportType))
  reportType: ConnectReportType;

  @ApiPropertyOptional({ type: ConnectReportFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectReportFiltersDto)
  filters?: ConnectReportFiltersDto;

  @ApiPropertyOptional({
    default: CONNECT_LIMITS.REPORT_EXPORT_DEFAULT_LIMIT,
    maximum: CONNECT_LIMITS.REPORT_EXPORT_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONNECT_LIMITS.REPORT_EXPORT_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
