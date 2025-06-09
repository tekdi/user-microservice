import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsEnum, ValidateNested, IsArray, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionStatus } from '../entities/form-submission.entity';
import { FieldValueDto } from './create-form-submission.dto';
import { MemberStatus } from '../../cohortMembers/entities/cohort-member.entity';
import { FieldValuesOptionDto } from '../../user/dto/user-create.dto';
import { Expose } from 'class-transformer';

export class FormSubmissionUpdateDto {
  @ApiProperty({
    type: String,
    description: 'The submissionId of the form submission',
  })
  @IsUUID()
  @IsOptional()
  submissionId?: string;

  @ApiProperty({
    type: String,
    description: 'The formId of the form submission',
  })
  @IsUUID()
  @IsOptional()
  formId?: string;

  @ApiProperty({
    type: String,
    description: 'The itemId (userId) of the form submission',
  })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiProperty({
    enum: FormSubmissionStatus,
    description: 'The status of the form submission',
  })
  @IsEnum(FormSubmissionStatus)
  @IsOptional()
  status?: FormSubmissionStatus;

  @ApiProperty({
    type: String,
    description: 'The user who updated the submission',
  })
  @IsUUID()
  @IsOptional()
  updatedBy?: string;
}

export class FieldValueUpdateDto extends FieldValueDto {
  @ApiProperty({
    type: String,
    description: 'The ID of the field value to update',
  })
  @IsUUID()
  @IsOptional()
  fieldValueId?: string;
}

export class CohortMemberUpdateDto {
  @Expose()
  tenantId?: string;

  @ApiProperty({
    type: String,
    description: 'The cohort membership ID',
  })
  @IsUUID()
  @IsOptional()
  cohortMembershipId?: string;

  @ApiProperty({
    type: String,
    description: 'The cohort ID',
  })
  @IsUUID()
  @IsOptional()
  cohortId?: string;

  @ApiProperty({
    type: String,
    description: 'The user ID',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    enum: MemberStatus,
    description: 'The status of the cohort member',
  })
  @IsEnum(MemberStatus)
  @IsOptional()
  status?: MemberStatus;

  @ApiProperty({
    type: String,
    description: 'The status change reason (required when status is DROPOUT)',
  })
  @ValidateIf((o) => o.status === MemberStatus.DROPOUT)
  @IsString()
  statusReason?: string;

  @ApiProperty({
    type: [FieldValuesOptionDto],
    description: 'Array of custom fields',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  @IsOptional()
  customFields?: FieldValuesOptionDto[];

  @Expose()
  @IsOptional()
  createdAt?: string;

  @Expose()
  @IsOptional()
  updatedAt?: string;

  @ApiProperty({
    type: String,
    description: 'The user who created the cohort member',
  })
  @Expose()
  @IsOptional()
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'The user who updated the cohort member',
  })
  @Expose()
  @IsOptional()
  updatedBy?: string;
}

export class UpdateFormSubmissionDto {
  @ApiProperty({
    type: FormSubmissionUpdateDto,
    description: 'The form submission details to update',
  })
  @ValidateNested()
  @Type(() => FormSubmissionUpdateDto)
  @IsOptional()
  formSubmission?: FormSubmissionUpdateDto;

  @ApiProperty({
    type: [FieldValuesOptionDto],
    description: 'Array of custom fields',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  @IsOptional()
  @IsArray()
  customFields?: FieldValuesOptionDto[];

  @ApiProperty({
    type: CohortMemberUpdateDto,
    description: 'Cohort member details to update',
  })
  @ValidateNested()
  @Type(() => CohortMemberUpdateDto)
  @IsOptional()
  cohortMember?: CohortMemberUpdateDto;

  @ApiProperty({
    type: String,
    description: 'The user who is performing the update',
  })
  @IsUUID()
  @IsOptional()
  updatedBy?: string;
} 