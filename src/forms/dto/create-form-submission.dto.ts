import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  ValidateNested,
  ArrayNotEmpty,
  ValidateIf,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionStatus } from '../entities/form-submission.entity';
import { MemberStatus } from '../../cohortMembers/entities/cohort-member.entity';
import { FieldValuesOptionDto } from '../../user/dto/user-create.dto';

export class FieldValueDto {
  @ApiProperty({
    type: String,
    description: 'The fieldId of the field value',
  })
  @IsUUID()
  @IsNotEmpty()
  fieldId: string;

  @ApiProperty({
    type: String,
    description: 'The value of the field',
  })
  @IsNotEmpty()
  value: string;
}

export class FormSubmissionDto {
  @ApiProperty({
    type: String,
    description: 'The formId of the form submission',
  })
  @IsUUID()
  @IsNotEmpty()
  formId: string;

  @ApiProperty({
    type: String,
    description: 'The itemId (userId) of the form submission',
  })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({
    enum: FormSubmissionStatus,
    description: 'The status of the form submission',
    default: FormSubmissionStatus.ACTIVE,
  })
  @IsEnum(FormSubmissionStatus)
  @IsOptional()
  status?: FormSubmissionStatus;
}

export class CohortMemberDto {
  @ApiProperty({
    type: String,
    description: 'The cohortId for cohort member creation',
  })
  @IsUUID()
  @IsNotEmpty()
  cohortId: string;

  @ApiProperty({
    type: String,
    description: 'The roleId for cohort member creation',
  })
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @ApiProperty({
    type: String,
    description: 'The academic year ID for cohort member creation',
  })
  @IsUUID()
  @IsOptional()
  cohortAcademicYearId?: string;

  @ApiProperty({
    enum: MemberStatus,
    description: 'The status of the cohort member',
    default: MemberStatus.APPLIED,
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
}

export class CreateFormSubmissionDto {
  @ApiProperty({
    type: String,
    description: 'The userId for the submission',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    type: String,
    description: 'The tenantId for the submission',
  })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({
    type: String,
    description:
      'The academic year ID for cohort member creation (required when cohortMember is present)',
  })
  @IsUUID()
  @IsOptional()
  cohortAcademicYearId?: string;

  @ApiProperty({
    type: FormSubmissionDto,
    description: 'The form submission details',
  })
  @ValidateNested()
  @Type(() => FormSubmissionDto)
  @IsNotEmpty()
  formSubmission: FormSubmissionDto;

  @ApiProperty({
    type: [FieldValueDto],
    description: 'Array of custom fields',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  @ArrayNotEmpty()
  customFields: FieldValueDto[];

  @ApiProperty({
    type: CohortMemberDto,
    description: 'Optional cohort member details',
  })
  @ValidateNested()
  @Type(() => CohortMemberDto)
  @IsOptional()
  cohortMember?: CohortMemberDto;
}
