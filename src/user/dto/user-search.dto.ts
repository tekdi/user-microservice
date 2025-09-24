import { Expose } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
  IsUUID,
  IsEnum,
  ValidateIf,
  ArrayMinSize,
  ArrayMaxSize,
  IsEmail,
  IsBoolean,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class setFilters {
  @ApiPropertyOptional({
    type: String,
    description: 'State',
  })
  state: string;

  @ApiPropertyOptional({
    type: String,
    description: 'District',
  })
  district: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Block',
  })
  block: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Role',
  })
  role: string;

  @ApiPropertyOptional({
    type: String,
    description: 'User Name',
  })
  username: string;

  @ApiPropertyOptional({
    type: String,
    description: 'User Id',
  })
  userId: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'email Ids',
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  email: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Auto Tags',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  auto_tags: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'status',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(['active', 'inactive'], { each: true })
  status: string[];

  /**
   * Search text to search across username, email, firstName, middleName, and lastName columns.
   * Supports space-separated terms (e.g., "john doe" will search for both "john" and "doe").
   * The entire searchtext must be at least 2 characters long.
   */
  @ApiPropertyOptional({
    type: String,
    description:
      'Search text for username, email, firstName, middleName, lastName',
    example: 'john doe',
    minLength: 2,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Search text must be at least 2 characters long' })
  searchtext?: string;
}
export class excludeFields {
  @ApiProperty({
    type: [String],
    description: 'Exclude User IDs',
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  userIds?: string[];

  @ApiProperty({
    type: [String],
    description: 'Exclude Cohort IDs',
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  cohortIds?: string[];
}

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class tenantCohortRoleMappingDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Tenant Id',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    type: [String],
    description: 'Cohort Id',
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  cohortId?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Role Id',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  roleId: string;
}

export class UserSearchDto {
  @ApiProperty({
    type: Number,
    description: 'Limit',
  })
  @Expose()
  @IsOptional()
  limit: number;

  @ApiProperty({
    type: Number,
    description: 'Offset',
  })
  @Expose()
  @IsOptional()
  offset: number;

  @ApiProperty({
    type: setFilters,
    description: 'Filters',
  })
  @Expose()
  @IsOptional()
  @IsObject()
  filters: setFilters;

  @ApiProperty({
    type: [String],
    description: 'Custom Fields Name',
    default: [],
  })
  @Expose()
  @IsOptional()
  customFieldsName: string[];

  @ApiPropertyOptional({
    type: tenantCohortRoleMappingDto,
    description: 'Tenant Cohort RoleMapping',
  })
  @Expose()
  @IsOptional()
  @IsObject()
  tenantCohortRoleMapping: tenantCohortRoleMappingDto;

  @ApiPropertyOptional({
    type: excludeFields,
    description: 'Filters',
  })
  @Expose()
  @IsOptional()
  @IsObject()
  exclude: excludeFields;

  @ApiPropertyOptional({
    description: 'Sort',
    example: ['username', 'asc'],
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: 'Sort array must contain exactly two elements' })
  @ArrayMaxSize(2, { message: 'Sort array must contain exactly two elements' })
  sort: [string, string];

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include custom fields in response (default: true)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeCustomFields?: boolean;

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, {
    each: true,
    message: 'Sort[1] must be either asc or desc',
  })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1] : undefined;
  }

  constructor(partial: Partial<UserSearchDto>) {
    Object.assign(this, partial);
  }

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Flag to export as CSV',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDisplayValues?: boolean;
}
