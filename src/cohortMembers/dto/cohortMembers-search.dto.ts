import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsArray,
  IsOptional,
  ValidateIf,
  IsString,
  ValidateNested,
  IsUUID,
  IsBoolean,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}
class FiltersDto {
  @ApiPropertyOptional({ type: String, description: 'Cohort ID', example: '' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ValidateIf((o) => !o.userId)
  cohortId?: string[];

  @ApiPropertyOptional({ type: String, description: 'User ID', example: '' })
  // @IsOptional()
  @IsString()
  @IsUUID()
  @ValidateIf((o) => !o.cohortId)
  userId?: string;

  @ApiPropertyOptional({ type: String, description: 'Role', example: '' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ type: Array, description: 'Status', example: [] })
  @IsOptional()
  @IsArray()
  status?: string[]; // Assuming status is an array of strings

  @ApiPropertyOptional({
    type: [String],
    description:
      'Completion Percentage Ranges (alias for formSubmissionCompletionPercentage)',
    example: ['1-20', '21-40'],
  })
  @IsOptional()
  @IsArray()
  completionPercentage?: string[];

  /**
   * Search text to search across username, email, firstName, middleName, and lastName columns.
   * Supports space-separated terms (e.g., "john doe" will search for both "john" and "doe").
   * The entire searchtext must be at least 2 characters long.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Search text must be at least 2 characters long' })
  searchtext?: string;

  /**
   * Aspire Leaders: country NAMES, matched on the APPLICATION country - the
   * snapshot on CohortMembers.user_cohort_country_id taken when the applicant
   * joined that cohort (falling back to Users.currentCountry when it never
   * resolved), i.e. the "Application Country" column the Applicant List
   * renders.
   *
   * The Applicant List (POST /cohortmember/list-application) has TWO
   * independent country dropdowns and this is the first of them; send
   * `currentCountry` below for the other. Both may be sent together and are
   * ANDed, which is what makes "applied from India, living in Iceland now"
   * answerable. This is also the dimension a Regional Admin's assigned
   * countries scope the list on.
   *
   * Not typed @IsArray: a single country name string is accepted too (both
   * query builders normalise it), and tightening it would 400 existing callers.
   */
  @ApiPropertyOptional({
    type: [String],
    description:
      'Country names filtering the application-country snapshot (the "Application Country" column on /cohortmember/list-application), not the live profile country.',
    example: ['India', 'Iceland'],
  })
  @IsOptional()
  applicationCountry?: string[] | string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Country names filtering the live profile country (Users.currentCountry, the "Country" column). Independent of applicationCountry; sending both ANDs them.',
    example: ['India'],
  })
  @IsOptional()
  currentCountry?: string[] | string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Legacy spelling of currentCountry - filters Users.currentCountry on every endpoint.',
    example: ['India'],
  })
  @IsOptional()
  country?: string[] | string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Auto tags to filter users',
    example: ['completed_alumni', 'all_alumni'],
  })
  @IsOptional()
  @IsArray()
  auto_tags?: string[];

  @ApiPropertyOptional({
    type: String,
    description:
      'Filter by createdAt. Supports: single date (2025-11-14), date with time (2025-11-14 11:40), or date range (2025-11-14 to 2025-11-20)',
    example: '2025-11-14',
  })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Filter by updatedAt. Supports: single date (2025-11-14), date with time (2025-11-14 11:40), or date range (2025-11-14 to 2025-11-20)',
    example: '2025-11-14',
  })
  @IsOptional()
  @IsString()
  updatedAt?: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Filter by cohort start date. Supports operators: gt, gte, lt, lte, eq, ne. Example: {"lte": "2025-11-20"}',
    example: { lte: '2025-11-20' },
  })
  @IsOptional()
  cohort_startDate?: { [key: string]: string };

  @ApiPropertyOptional({
    type: Object,
    description:
      'Filter by cohort end date. Supports operators: gt, gte, lt, lte, eq, ne. Example: {"gte": "2025-11-20"}',
    example: { gte: '2025-11-20' },
  })
  @IsOptional()
  cohort_endDate?: { [key: string]: string };
}
export class CohortMembersSearchDto {
  @ApiProperty({
    type: Number,
    description: 'Limit',
  })
  limit: number;

  @ApiProperty({
    type: Number,
    description: 'Offset',
  })
  offset: number;

  @ApiProperty({
    type: FiltersDto,
    description: 'Filters',
    example: {
      cohortId: '',
      userId: '',
      role: '',
      name: '',
      status: [],
      academicYearIds: [],
    }, // Adding example for Swagger
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FiltersDto)
  filters?: FiltersDto; // Define cohortId and userId properties

  @ApiPropertyOptional({
    description: 'Sort',
    example: ['createdAt', 'asc'],
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: 'Sort array must contain exactly two elements' })
  @ArrayMaxSize(2, { message: 'Sort array must contain exactly two elements' })
  sort: [string, string];

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, {
    each: true,
    message: 'Sort[1] must be either asc or desc',
  })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1] : undefined;
  }

  constructor(partial: Partial<CohortMembersSearchDto>) {
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
