import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ReferralEntityStatus,
  ReferralEntitySubType,
  ReferralEntityType,
} from '../referrals.types';

export class CreateReferralEntityDto {
  @ApiPropertyOptional({ description: 'Custom slug. Allowed characters: letters (A-Z, a-z), digits, hyphens (-), underscores (_), dots (.) and tildes (~). Input is lowercased before storage. If omitted, auto-generated.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiProperty({ description: 'First name (or full org/university name)' })
  @IsString()
  @MaxLength(255)
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name (optional for org/university)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiProperty({ enum: ReferralEntityType })
  @IsEnum(ReferralEntityType)
  type: ReferralEntityType;

  @ApiProperty({ enum: ReferralEntitySubType })
  @IsEnum(ReferralEntitySubType)
  subType: ReferralEntitySubType;

  @ApiPropertyOptional({ description: 'Region (optional)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ description: 'Linked internal entity UUID (optional)' })
  @IsOptional()
  @IsString()
  linkedEntityId?: string;

  @ApiPropertyOptional({ description: 'Primary contact email (optional)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Additional emails (array of email strings)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  additionalEmails?: string[];

  @ApiPropertyOptional({ description: 'Country (optional)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ enum: ReferralEntityStatus, default: ReferralEntityStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ReferralEntityStatus)
  status?: ReferralEntityStatus;
}

