import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsObject, ValidateNested, IsBoolean, IsEnum, IsArray, ArrayNotEmpty } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PathwayType } from '../entities/pathway.entity';
import { PathwayHistoryStatus } from '../entities/user-pathway-history.entity';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum PathwayUserSortColumn {
  ACTIVATED_AT = 'activatedAt',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  EMAIL = 'email',
  GENDER = 'gender',
  IS_ACTIVE = 'isActive',
  PATHWAY_NAME = 'pathwayName',
  DEACTIVATED_AT = 'deactivatedAt',
  COMPLETED_AT = 'completedAt',
  HISTORY_STATUS = 'historyStatus',
}

class ListPathwayUsersFiltersDto {
  @ApiPropertyOptional({
    description: 'Free-text search (matches against firstName, lastName, or email)',
    example: 'John',
  })
  @Expose()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status in pathway (backward-compatible boolean)',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by pathway type (STANDARD or VOLUNTEER). Useful for volunteer reporting.',
    enum: PathwayType,
    example: PathwayType.VOLUNTEER,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PathwayType)
  pathwayType?: PathwayType;

  @ApiPropertyOptional({
    description: 'Filter by history status (ACTIVE, COMPLETED, WITHDRAWN, INACTIVE).',
    enum: PathwayHistoryStatus,
    example: PathwayHistoryStatus.COMPLETED,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PathwayHistoryStatus)
  historyStatus?: PathwayHistoryStatus;

  @ApiPropertyOptional({
    description: 'Filter by volunteer pathway subtype (e.g. CAL, CL, DL). Only applies when pathwayType = VOLUNTEER.',
    example: 'CAL',
  })
  @Expose()
  @IsOptional()
  @IsString()
  subtype?: string;

  @ApiPropertyOptional({
    description: 'When true, only return VOLUNTEER participants whose pathway.volunteer_valid_until >= NOW() (current volunteers). Requires pathwayType = VOLUNTEER.',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  valid?: boolean;

  /**
   * Aspire Leaders-specific: country NAMES to narrow the report to, as sent by
   * the admin UI's Country dropdown. Optional - omit for no narrowing.
   *
   * Matched against Users.currentCountry (the user's LIVE profile country),
   * which is the country rule every report on the platform scopes on except
   * the application report - see REPORT_COUNTRY_SOURCE in
   * Aspire-specific-service's cohort-country-filter.ts.
   *
   * This can only ever SUBTRACT from the server-side allowed-country check
   * that already runs for a Regional Admin (see
   * PathwaysService.getPathwayReportCountryScope), so it cannot be used to
   * reach outside an admin's assigned countries.
   *
   * NOTE: this route runs ValidationPipe({ whitelist: true }), so this field
   * MUST stay declared here - an undeclared property is silently stripped from
   * the body, which would make a caller's narrowing quietly disappear.
   */
  @ApiPropertyOptional({
    type: [String],
    description:
      "Country NAMES to narrow the report to, matched against the user's live currentCountry. Omit for no narrowing.",
    example: ['India', 'Kenya'],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];
}

class ListPathwayUsersSortDto {
  @ApiPropertyOptional({
    description: 'Column to sort by',
    example: 'activated_at',
    enum: PathwayUserSortColumn,
  })
  @Expose()
  @IsOptional()
  @IsEnum(PathwayUserSortColumn)
  column?: PathwayUserSortColumn;

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'DESC',
    enum: SortOrder,
  })
  @Expose()
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder;
}

export class ListPathwayUsersDto extends PaginationDto {
  @ApiProperty({
    description: 'List of pathway UUIDs',
    example: ['c3b6e50e-40ab-4148-8ca9-3b2296ca11e5'],
  })
  @Expose()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, {
    each: true,
    message: 'each value in pathwayIds must be a valid UUID',
  })
  pathwayIds: string[];

  @ApiPropertyOptional({
    description: 'Filters for pathway users',
    type: ListPathwayUsersFiltersDto,
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ListPathwayUsersFiltersDto)
  filters?: ListPathwayUsersFiltersDto;

  @ApiPropertyOptional({
    description: 'Sorting options',
    type: ListPathwayUsersSortDto,
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ListPathwayUsersSortDto)
  sort?: ListPathwayUsersSortDto;
}
