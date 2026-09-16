import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Express } from 'express';

export class BulkImportDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'CSV or XLSX file containing user data',
  })
  @IsNotEmpty()
  file: Express.Multer.File;

  @ApiProperty({
    type: String,
    description: 'The cohort ID to add users to',
  })
  @IsNotEmpty()
  @IsUUID()
  @IsString()
  cohortId: string;

  @ApiProperty({
    type: String,
    required: false,
    description:
      'Role to assign to the imported users. Defaults to the student role. Pass the observer role to bulk-insert observers - they are added to the cohort as shortlisted members and, unlike applicants, get no application form submission.',
  })
  @IsOptional()
  @IsUUID()
  @IsString()
  roleId?: string;
}

export interface BulkImportUserData {
  username: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  mobile?: string;
  mobile_country_code?: string;
  gender?: string;
  dob?: string;
  country?: string;
  permanentCountry?: string;
  currentCountry?: string;
  address?: string;
  district?: string;
  state?: string;
  pincode?: string;
  status?: string;
  customFields?: any[];
} 