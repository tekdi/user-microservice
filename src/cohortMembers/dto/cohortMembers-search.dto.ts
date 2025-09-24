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

  @ApiPropertyOptional({
    type: [String],
    description: 'Auto tags to filter users',
    example: ['completed_alumni', 'all_alumni'],
  })
  @IsOptional()
  @IsArray()
  auto_tags?: string[];
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
