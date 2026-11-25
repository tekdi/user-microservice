import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s{2,}/g, ' ') : value;

/** Accepts true/false and the strings "true"/"false" (query-style payloads). */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Same rule as the admin Create User form: letters and digits, up to 10. Stored upper-case. */
export const ORGANISATION_CODE_PATTERN = /^[A-Za-z0-9]{1,10}$/;
/** Letters, digits, spaces and the punctuation real organisation names use. */
export const ORGANISATION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 &.,'()-]*$/;
/** Letters, digits, spaces and . - ( ) ' (branch names such as "PATNA (URBAN)"). */
export const BRANCH_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'()-]*$/;
/** Letters, digits and hyphens, up to 20, starting with a letter or digit. Stored upper-case. */
export const BRANCH_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;

export const MASTER_LIST_DEFAULT_LIMIT = 20;
export const MASTER_LIST_MAX_LIMIT = 500;

export class MasterListDto {
  @ApiPropertyOptional({ description: 'Matches name or code (case-insensitive, partial)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ description: 'true = active only, false = deactivated only, omit = both' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: MASTER_LIST_DEFAULT_LIMIT, maximum: MASTER_LIST_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MASTER_LIST_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class OrganisationListDto extends MasterListDto {}

export class CreateOrganisationDto {
  @ApiProperty({ example: 'SWD01', description: 'Letters and digits, up to 10. Never changes after create' })
  @IsString()
  @Transform(trim)
  @Matches(ORGANISATION_CODE_PATTERN, {
    message: 'code must be 1 to 10 letters or digits',
  })
  code: string;

  @ApiProperty({ example: 'Swadhaar FinServe' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(150)
  @Matches(ORGANISATION_NAME_PATTERN, {
    message: "name may use letters, digits, spaces and & . , ' ( ) -",
  })
  name: string;
}

/** Code never changes. Deactivate with isActive=false; nothing is deleted. */
export class UpdateOrganisationDto {
  @ApiPropertyOptional({ example: 'Swadhaar FinServe Pvt Ltd' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'name cannot be empty' })
  @MaxLength(150)
  @Matches(ORGANISATION_NAME_PATTERN, {
    message: "name may use letters, digits, spaces and & . , ' ( ) -",
  })
  name?: string;

  @ApiPropertyOptional({ description: 'false deactivates, true reactivates' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class BranchListDto extends MasterListDto {
  @ApiPropertyOptional({ description: 'State option value' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stateValue?: string;

  @ApiPropertyOptional({ description: 'District (city) option value' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  districtValue?: string;
}

export class DistrictListDto {
  @ApiPropertyOptional({ description: 'State option value; omit for every district' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stateValue?: string;
}

export class CreateBranchDto {
  @ApiProperty({ description: 'District (city) option value the branch belongs to' })
  @IsString()
  @IsNotEmpty({ message: 'districtValue is required' })
  @MaxLength(255)
  districtValue: string;

  @ApiProperty({ example: 'DANAPUR' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100)
  @Matches(BRANCH_NAME_PATTERN, {
    message: "name may use letters, digits, spaces and . ' ( ) -",
  })
  name: string;

  @ApiProperty({ example: 'BR-PAT01', description: 'Letters, digits and hyphens, up to 20. Never changes after create' })
  @IsString()
  @Transform(trim)
  @Matches(BRANCH_CODE_PATTERN, {
    message: 'code must be 1 to 20 letters, digits or hyphens',
  })
  code: string;
}

/** Code and district never change. Deactivate with isActive=false; nothing is deleted. */
export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'DANAPUR' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'name cannot be empty' })
  @MaxLength(100)
  @Matches(BRANCH_NAME_PATTERN, {
    message: "name may use letters, digits, spaces and . ' ( ) -",
  })
  name?: string;

  @ApiPropertyOptional({ description: 'false deactivates, true reactivates' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
