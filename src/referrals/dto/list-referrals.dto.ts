import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ReferralEntitySubType, ReferralEntityType } from '../referrals.types';

export class ReferralFiltersDto {
  @ApiPropertyOptional({ enum: ReferralEntityType, description: 'Filter by referral type' })
  @IsOptional()
  @IsEnum(ReferralEntityType)
  type?: ReferralEntityType;

  @ApiPropertyOptional({ enum: ReferralEntitySubType, description: 'Filter by referral sub-type' })
  @IsOptional()
  @IsEnum(ReferralEntitySubType)
  subType?: ReferralEntitySubType;

  @ApiPropertyOptional({ type: String, description: 'Search across firstName, lastName, contactEmail, and slug' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: [String], description: 'Filter by regions' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Filter by countries' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];
}

export class ListReferralsDto {
  @ApiPropertyOptional({ description: 'Number of records to return', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of records to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ type: ReferralFiltersDto, description: 'Filters to apply' })
  @IsOptional()
  @IsObject()
  @Type(() => ReferralFiltersDto)
  filters?: ReferralFiltersDto;
}
