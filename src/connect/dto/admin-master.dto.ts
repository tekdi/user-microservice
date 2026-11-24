import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
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
  CONNECT_KEY_REGEX,
  CONNECT_MASTER_BULK_MAX,
} from "../constants/connect.constants";

const trim = ({ value }) => (typeof value === "string" ? value.trim() : value);

/** Query string "true" / "false" → boolean; anything else is left for validation */
const toBoolean = ({ value }) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};
const KEY_MESSAGE = "key must be lowercase letters/numbers joined by _";

// ---------------------------------------------------------------------
// Career domain groups
// ---------------------------------------------------------------------

export class CareerDomainGroupItemDto {
  @ApiPropertyOptional({
    example: "stem",
    description: "Unique key. Made from name when left out",
  })
  @Transform(trim)
  @IsOptional()
  @Matches(CONNECT_KEY_REGEX, { message: KEY_MESSAGE })
  @MaxLength(60)
  key?: string;

  @ApiProperty({ example: "STEM" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SaveCareerDomainGroupsDto {
  @ApiProperty({ type: [CareerDomainGroupItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONNECT_MASTER_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => CareerDomainGroupItemDto)
  items: CareerDomainGroupItemDto[];
}

/** Renaming a group here changes it for every domain in it (name is stored once) */
export class UpdateCareerDomainGroupDto extends PartialType(
  OmitType(CareerDomainGroupItemDto, ["key"] as const)
) {}

// ---------------------------------------------------------------------
// Career domains (sub-domains)
// ---------------------------------------------------------------------

export class CareerDomainItemDto {
  @ApiPropertyOptional({
    example: "data_analytics",
    description: "Unique key. Made from name when left out",
  })
  @Transform(trim)
  @IsOptional()
  @Matches(CONNECT_KEY_REGEX, { message: KEY_MESSAGE })
  @MaxLength(60)
  key?: string;

  @ApiProperty({ example: "Data & Analytics" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: "stem", description: "Key of the group" })
  @Transform(trim)
  @Matches(CONNECT_KEY_REGEX, { message: KEY_MESSAGE })
  @MaxLength(60)
  groupKey: string;

  @ApiPropertyOptional({
    example: "STEM",
    description:
      "Creates the group when groupKey is new; renames it when different. Leave out to use the group as it is",
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  groupName?: string;

  @ApiPropertyOptional({
    example: 7,
    description: "New rows without it go to the end; existing rows keep theirs",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SaveCareerDomainsDto {
  @ApiProperty({ type: [CareerDomainItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONNECT_MASTER_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => CareerDomainItemDto)
  items: CareerDomainItemDto[];
}

/** groupKey moves the domain to another (existing) group */
export class UpdateCareerDomainDto extends PartialType(
  OmitType(CareerDomainItemDto, ["key", "groupName"] as const)
) {}

// ---------------------------------------------------------------------
// "Open to" options (support_offering_types)
// ---------------------------------------------------------------------

export class SupportOfferingItemDto {
  @ApiPropertyOptional({
    example: "giving_career_advice",
    description: "Unique key. Made from label when left out",
  })
  @Transform(trim)
  @IsOptional()
  @Matches(CONNECT_KEY_REGEX, { message: KEY_MESSAGE })
  @MaxLength(50)
  key?: string;

  @ApiProperty({ example: "Giving career advice" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SaveSupportOfferingsDto {
  @ApiProperty({ type: [SupportOfferingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONNECT_MASTER_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => SupportOfferingItemDto)
  items: SupportOfferingItemDto[];
}

export class UpdateSupportOfferingDto extends PartialType(
  OmitType(SupportOfferingItemDto, ["key"] as const)
) {}

// ---------------------------------------------------------------------
// List query (GET ?isActive=&search=&limit=&offset=, B5 also groupId=)
// ---------------------------------------------------------------------

export const CONNECT_MASTER_LIST_LIMIT_MAX = 100;
export const CONNECT_MASTER_SEARCH_MAX = 100;

export class ListMasterQueryDto {
  @ApiPropertyOptional({ description: "Leave out to get active and inactive" })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Case-insensitive “contains” on the name / label",
    maxLength: CONNECT_MASTER_SEARCH_MAX,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CONNECT_MASTER_SEARCH_MAX)
  search?: string;

  @ApiPropertyOptional({
    description: "Page size. Leave out to get every matching row",
    minimum: 1,
    maximum: CONNECT_MASTER_LIST_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONNECT_MASTER_LIST_LIMIT_MAX)
  limit?: number;

  @ApiPropertyOptional({ description: "Rows to skip", minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListCareerDomainsQueryDto extends ListMasterQueryDto {
  @ApiPropertyOptional({
    description: "Only domains of this group",
    format: "uuid",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
