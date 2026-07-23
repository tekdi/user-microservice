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
