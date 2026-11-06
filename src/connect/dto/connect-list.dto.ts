import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CONNECT_CURRENT_STATUS_KEYS,
  CONNECT_LIMITS,
  ConnectLinkedinVisit,
  ConnectListSort,
} from "../constants/connect.constants";

const trim = ({ value }) => (typeof value === "string" ? value.trim() : value);

/** Every filter is optional; filters are combined with AND */
export class ConnectListFiltersDto {
  /**
   * Career domain: whole groups ("All of STEM") and/or single sub-domains,
   * up to 2 picks in total. A member matches any of the picks.
   */
  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 2 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONNECT_LIMITS.CAREER_DOMAIN_FILTER_MAX)
  @IsUUID("all", { each: true })
  careerDomainGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 2 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONNECT_LIMITS.CAREER_DOMAIN_FILTER_MAX)
  @IsUUID("all", { each: true })
  careerDomainIds?: string[];

  /** "Open to": members who picked any of these (up to 2) */
  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 2 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONNECT_LIMITS.LIST_MAX_MULTI_FILTER)
  @IsUUID("all", { each: true })
  openToIds?: string[];

  /** Status (pick 1) */
  @ApiPropertyOptional({ enum: CONNECT_CURRENT_STATUS_KEYS, nullable: true })
  @IsOptional()
  @IsIn(CONNECT_CURRENT_STATUS_KEYS)
  currentStatus?: string | null;

  /** One country name, as returned in GET /connect/options → countries[].name */
  @ApiPropertyOptional({ example: "India", nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  /** all | visited | not_visited | reported (members the viewer reported) */
  @ApiPropertyOptional({
    enum: ConnectLinkedinVisit,
    default: ConnectLinkedinVisit.ALL,
  })
  @IsOptional()
  @IsIn(Object.values(ConnectLinkedinVisit))
  linkedinVisit?: ConnectLinkedinVisit;
}

export class ConnectListDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: CONNECT_LIMITS.LIST_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONNECT_LIMITS.LIST_MAX_LIMIT)
  limit?: number = CONNECT_LIMITS.LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    enum: ConnectListSort,
    default: ConnectListSort.SAME_COHORT,
  })
  @IsOptional()
  @IsIn(Object.values(ConnectListSort))
  sort?: ConnectListSort = ConnectListSort.SAME_COHORT;

  @ApiPropertyOptional({
    description: "Send back the seed from the previous page",
    example: "k3f9a1",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]{4,16}$/)
  seed?: string;

  /** Name, place (city / state / country), cohort, or words from the profile */
  @ApiPropertyOptional({ example: "C1 2023" })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: ConnectListFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectListFiltersDto)
  filters?: ConnectListFiltersDto;
}
