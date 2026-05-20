import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ReferralUserStatus {
  // Derived from users.temporaryPassword
  REGISTERED = 'registered',    // temporaryPassword = true  (account created, never logged in)
  ACTIVATED = 'activated',      // temporaryPassword = false (has reset password / logged in)
  // From users.status
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  // From cohortMembers.status
  APPLIED = 'applied',
  SUBMITTED = 'submitted',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
  DROPOUT = 'dropout',
}

export class ReferralReportFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by referral entity UUID (slug_id)' })
  @IsOptional()
  @IsString()
  slug_id?: string;

  @ApiPropertyOptional({ description: 'Filter by slug string (also checks slug history for old slugs)' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Filter attributed users by cohort IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cohortIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by user status: registered | activated | active | inactive | applied | submitted | shortlisted | rejected | dropout',
    enum: ReferralUserStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ReferralUserStatus, { each: true })
  statuses?: ReferralUserStatus[];

  @ApiPropertyOptional({ description: 'Filter users by auto_tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ReferralReportRequestDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @ApiPropertyOptional({ type: ReferralReportFiltersDto })
  @IsOptional()
  filters?: ReferralReportFiltersDto;
}
