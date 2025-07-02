import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionStatus } from '../entities/form-submission.entity';
import { FieldValueDto } from './create-form-submission.dto';
import { FieldValuesOptionDto } from '../../user/dto/user-create.dto';

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

  @ApiProperty({
    type: Number,
    description: 'The completion percentage of the form submission (0-100)',
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  completionPercentage?: number;
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
    type: String,
    description: 'The user who is performing the update',
  })
  @IsUUID()
  @IsOptional()
  updatedBy?: string;

  @ApiProperty({
    type: String,
    description: 'The tenant ID for the update',
  })
  @IsUUID()
  @IsOptional()
  tenantId?: string;
}
