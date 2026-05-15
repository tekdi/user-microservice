import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReferralEntityStatus, ReferralEntitySubType, ReferralEntityType } from '../referrals.types';

export class UpdateReferralSlugDto {
  @ApiPropertyOptional({ description: 'New slug (any format accepted; will be normalized to lowercase a-z0-9_)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ description: 'First name (or full org/university name)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name (optional for org/university)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional({ enum: ReferralEntityType })
  @IsOptional()
  @IsEnum(ReferralEntityType)
  type?: ReferralEntityType;

  @ApiPropertyOptional({ enum: ReferralEntitySubType })
  @IsOptional()
  @IsEnum(ReferralEntitySubType)
  subType?: ReferralEntitySubType;

  @ApiPropertyOptional({ description: 'Region (optional)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ description: 'Country (optional)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Primary contact email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Additional emails (array)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  additionalEmails?: string[];

  @ApiPropertyOptional({ enum: ReferralEntityStatus })
  @IsOptional()
  @IsEnum(ReferralEntityStatus)
  status?: ReferralEntityStatus;
}
