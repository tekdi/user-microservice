import { Expose } from "class-transformer";
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
  IsString,
  Length,
  IsPhoneNumber,
  Matches,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class setFilters {
  @ApiPropertyOptional({
    type: [String],
    description: "State",
  })
  state: string;

  @ApiPropertyOptional({
    type: [String],
    description: "District",
  })
  @IsArray()
  district: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Block",
  })
  @IsArray()
  block: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Block",
  })
  @IsArray()
  village: string;

  @ApiPropertyOptional({
    type: String,
    description: "Role",
  })
  role: string;

  @ApiPropertyOptional({
    type: [String],
    description: "User Name",
  })
  @IsOptional()
  @IsArray()
  username: string[];


  @ApiProperty({
    type: [String],
    description: " User IDs",
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsUUID(undefined, { each: true })
  userId?: string[]; //This is dynamically used in db query

  @ApiPropertyOptional({
    type: [String],
    description: "email Ids",
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  email: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "status",
  })
  @IsOptional()
  @IsArray()
  @IsEnum(['active', 'inactive'], { each: true })
  status: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "tenantStatus - Status from UserTenantMapping table (active, inactive, archived)",
  })
  @IsOptional()
  @IsArray()
  @IsEnum(['active', 'inactive', 'archived'], { each: true })
  tenantStatus: string[];

  @ApiPropertyOptional({ type: String, description: 'Start date in YYYY-MM-DD format' })
  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid date string (YYYY-MM-DD)' })
  fromDate?: string;

  @ApiPropertyOptional({ type: String, description: 'End date in YYYY-MM-DD format' })
  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid date string (YYYY-MM-DD)' })
  toDate?: string;

  @ApiPropertyOptional({
    type: String,
    description: "Role",
  })
  tenantId: string;
}
export class excludeFields {
  @ApiProperty({
    type: [String],
    description: "Exclude User IDs",
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
    description: "Exclude Cohort IDs",
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
  ASC = "asc",
  DESC = "desc",
}

export class tenantCohortRoleMappingDto {
  @ApiPropertyOptional({
    type: String,
    description: "Tenant Id",
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    type: [String],
    description: "Cohort Id",
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
    description: "Role Id",
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  roleId: string;
}

export class SuggestUserDto{
  @ApiProperty({ type: String, description: 'First name of the user', maxLength: 50 })
  @Expose()
  @IsNotEmpty()
  @Length(1, 50)
  firstName: string;

  @ApiProperty({ type: String, description: 'Middle name of the user (optional)', maxLength: 50, required: false })
  @Expose()
  @IsOptional()
  @Length(0, 50)
  middleName?: string;

  @ApiProperty({ type: String, description: 'Last name of the user', maxLength: 50 })
  @Expose()
  @IsNotEmpty()
  @Length(1, 50)
  lastName: string;
  
  @ApiPropertyOptional({ type: String, description: "User Name" })
  @Expose()
  @IsNotEmpty()
  username: string;
}

export class ExistUserDto {  
    @ApiProperty({ type: String, description: 'First name of the user', maxLength: 50 })
    @Expose()
    @IsOptional()
    @Length(1, 50)
    firstName?: string;
  
    @ApiProperty({ type: String, description: 'Middle name of the user (optional)', maxLength: 50, required: false })
    @Expose()
    @IsOptional()
    @Length(0, 50)
    middleName?: string;

    @ApiProperty({ type: String, description: 'Middle name of the user (optional)', maxLength: 50, required: false })
    @Expose()
    @IsOptional()
    @Length(0, 50)
    lastName?: string;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiProperty({ type: () => String, description: 'Mobile number of the user (optional)' })
    @Expose()
    @IsOptional()
    @IsString({ message: 'Mobile number must be a string' })
    @Matches(/^[0-9]{10}$/, { message: 'Mobile number must be between 10 digits and contain only numbers' })
    mobile?: string;
}

export class UserSearchDto {
  @ApiProperty({
    type: Number,
    description: "Limit",
  })
  @Expose()
  @IsOptional()
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Offset",
  })
  @Expose()
  @IsOptional()
  offset: number;

  @ApiProperty({
    type: setFilters,
    description: "Filters",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  filters: setFilters;

  @ApiProperty({
    type: [String],
    description: "Custom Fields Name",
    default: [],
  })
  @Expose()
  @IsOptional()
  customFieldsName: string[];

  @ApiPropertyOptional({
    type: tenantCohortRoleMappingDto,
    description: "Tenant Cohort RoleMapping",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  tenantCohortRoleMapping: tenantCohortRoleMappingDto;

  @ApiPropertyOptional({
    type: excludeFields,
    description: "Filters",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  exclude: excludeFields;

  @ApiPropertyOptional({
    description: "Sort",
    example: ["username", "asc"],
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: "Sort array must contain exactly two elements" })
  @ArrayMaxSize(2, { message: "Sort array must contain exactly two elements" })
  sort: [string, string];

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, {
    each: true,
    message: "Sort[1] must be either asc or desc",
  })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1] : undefined;
  }

  @ApiPropertyOptional({
    type: String,
    description: "Include custom fields in response (default: true). Set to false for faster response.",
    default: "true",
  })
  @Expose()
  @IsOptional()
  @IsString()
  includeCustomFields?: string = "true";

  constructor(partial: Partial<UserSearchDto>) {
    Object.assign(this, partial);
  }
}
