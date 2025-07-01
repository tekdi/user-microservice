import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  ValidateNested,
  ArrayNotEmpty,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionStatus } from '../entities/form-submission.entity';

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
    enum: FormSubmissionStatus,
    description: 'The status of the form submission',
  })
  @IsEnum(FormSubmissionStatus)
  @IsOptional()
  status?: FormSubmissionStatus;

  @ApiProperty({
    type: Number,
    description: 'The completion percentage of the form submission (0-100)',
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  completionPercentage?: number;
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
}
