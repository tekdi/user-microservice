import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import {
  CONNECT_CURRENT_STATUS_KEYS,
  CONNECT_ERRORS,
  CONNECT_LIMITS,
  LINKEDIN_PROFILE_REGEX,
} from "../constants/connect.constants";

const trim = ({ value }) => (typeof value === "string" ? value.trim() : value);

/** Profile fields shared by join (POST) and edit (PATCH) */
export class ConnectProfileFieldsDto {
  /** "Tell us a bit about yourself" — first line on the card */
  @ApiProperty({
    example: "Building Connect, a networking space for Aspire graduates",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONNECT_LIMITS.HEADLINE_MAX)
  headline: string;

  @ApiProperty({ example: "linkedin.com/in/alex-morgan" })
  @Transform(trim)
  @IsString()
  @Matches(LINKEDIN_PROFILE_REGEX, {
    message: CONNECT_ERRORS.INVALID_LINKEDIN_URL.message,
  })
  linkedinUrl: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  careerDomainId: string;

  @ApiProperty({ enum: CONNECT_CURRENT_STATUS_KEYS })
  @IsIn(CONNECT_CURRENT_STATUS_KEYS)
  currentStatus: string;

  /** "Open to" — 1 or 2 ids from support_offering_types */
  @ApiProperty({ type: [String], format: "uuid", minItems: 1, maxItems: 2 })
  @IsArray()
  @ArrayMinSize(CONNECT_LIMITS.OPEN_TO_MIN)
  @ArrayMaxSize(CONNECT_LIMITS.OPEN_TO_MAX)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  openToIds: string[];

  @ApiPropertyOptional({ description: "At most 100 words", nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(CONNECT_LIMITS.ABOUT_MAX_CHARS)
  about?: string | null;
}

export class JoinConnectDto extends ConnectProfileFieldsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: CONNECT_ERRORS.TERMS_REQUIRED.message })
  acceptedTerms: boolean;
}
