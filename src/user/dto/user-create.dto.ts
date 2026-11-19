import { Expose, Type } from 'class-transformer';
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
  IsArray,
  IsUUID,
  ValidateNested,
  IsOptional,
  Length,
  IsEnum,
  Matches,
} from 'class-validator';
import { User } from '../entities/user-entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Allowed characters for employeeId and organisationCode (Task 20). */
export const ORG_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

export class tenantRoleMappingDto {
  @ApiProperty({
    type: String,
    description: 'Tenant Id',
  })
  @Expose()
  @IsOptional()
  @IsUUID(undefined, { message: 'Tenant Id must be a valid UUID' })
  tenantId: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'The cohort id of the user',
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  cohortIds: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'User Role',
  })
  @IsOptional()
  @Expose()
  @IsUUID(undefined, { message: 'Role Id must be a valid UUID' })
  roleId: string;
}

export class FieldValuesOptionDto {
  @ApiProperty({
    type: String,
    description: 'Field Id',
  })
  @Expose()
  @IsUUID(undefined, { message: 'Field Id must be a valid UUID' })
  fieldId: string;

  @ApiProperty({
    type: String,
    description: 'Field values',
  })
  @Expose()
  value: string;
}

export class UserCreateDto {
  @Expose()
  userId: string;

  @ApiProperty({ type: () => String })
  @Expose()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    type: String,
    description: 'First name of the user',
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @Length(1, 50)
  firstName: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Middle name of the user (optional)',
    maxLength: 50,
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 50)
  middleName?: string;

  @ApiProperty({
    type: String,
    description: 'Last name of the user',
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @Length(1, 50)
  lastName: string;

  @ApiProperty({
    type: String,
    description: 'Gender of the user',
    enum: [
      'male',
      'female',
      'transgender',
      'non-binary',
      'i do not want to disclose',
    ],
  })
  @Expose()
  @IsOptional()
  @IsEnum([
    'male',
    'female',
    'transgender',
    'non-binary',
    'i do not want to disclose',
  ])
  gender: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The date of Birth of the user',
  })
  @Expose()
  dob: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The contact number of the user',
  })
  @Expose()
  mobile: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The email of the user',
  })
  @Expose()
  email: string;

  @ApiProperty({
    type: String,
    description: 'The password of the user',
  })
  @IsNotEmpty()
  @Expose()
  password: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The country of the user',
  })
  @Expose()
  country: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Permanent country of residence',
  })
  @Expose()
  @IsOptional()
  @IsString()
  permanentCountry?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Current country of residence',
  })
  @Expose()
  @IsOptional()
  @IsString()
  currentCountry?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The state of the user',
  })
  @Expose()
  state: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The city of the user',
  })
  @Expose()
  city: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The address of the user',
  })
  @Expose()
  address: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Employee ID, unique within the organisation (organisationCode) in this tenant',
    example: 'E-101',
    maxLength: 50,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(ORG_IDENTIFIER_PATTERN, {
    message: 'employeeId may contain only letters, numbers, _ and -',
  })
  employeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Organisation code (stored upper-case, unique per tenant)',
    example: 'SWADHAR1',
    maxLength: 30,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(ORG_IDENTIFIER_PATTERN, {
    message: 'organisationCode may contain only letters, numbers, _ and -',
  })
  organisationCode?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Organisation name. Required when organisationCode is new; ignored (the stored name wins) when the code already exists',
    example: 'Swadhaar FinAccess 1',
    maxLength: 150,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organisationName?: string;

  @Expose()
  @IsOptional()
  @IsEnum(['active', 'inactive', 'archived'], {
    message: 'Status must be one of: active, inactive, archived',
  })
  status: string = 'active';

  // @ApiPropertyOptional({
  //   type: String,
  //   description: "The pincode of the user",
  // })
  // @Expose()
  // pincode: string;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;

  @Expose()
  createdBy: string;

  @Expose()
  updatedBy: string;

  // @ApiProperty({
  //   type: [tenantRoleMappingDto],
  //   description: "List of user attendance details",
  // })
  @ValidateNested({ each: true })
  @Type(() => tenantRoleMappingDto)
  tenantCohortRoleMapping: tenantRoleMappingDto[];

  //fieldValues
  @ApiPropertyOptional({
    type: [FieldValuesOptionDto],
    description: 'The fieldValues Object',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  customFields: FieldValuesOptionDto[];

  constructor(partial: Partial<UserCreateDto>) {
    Object.assign(this, partial);
  }

  @ApiPropertyOptional({
    type: String,
    description: 'The country code',
  })
  @Expose()
  mobile_country_code: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The Google reCAPTCHA token for student registration',
  })
  @Expose()
  @IsOptional()
  recaptchaToken?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Referral slug from /apply?refer={slug} (stored as first-touch attribution)',
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referralSlug?: string;
}
