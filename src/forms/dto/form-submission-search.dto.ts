import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsObject, IsArray, IsString, IsEnum, ArrayMinSize, ArrayMaxSize, ValidateIf, IsBoolean, IsUUID, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionStatus } from '../entities/form-submission.entity';
import { Expose } from 'class-transformer';

export class FiltersProperty {
  @ApiPropertyOptional({
    type: String,
    description: 'Form ID',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  formId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Item ID (User ID)',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  itemId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Status of the form submission',
    enum: FormSubmissionStatus,
    isArray: true
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsEnum(FormSubmissionStatus, { each: true })
  status?: FormSubmissionStatus[];

  @ApiPropertyOptional({
    type: String,
    description: 'Created by user ID',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  createdBy?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Updated by user ID',
  })
  @Expose()
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  updatedBy?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Custom fields to filter by using fieldId as key',
    example: {
      "fieldId-uuid": "value"
    }
  })
  @Expose()
  @IsOptional()
  @IsObject()
  customFieldsFilter?: Record<string, any>;
}

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class FormSubmissionSearchDto {
  @ApiProperty({
    type: Number,
    description: 'Number of records to return',
    default: 10
  })
  @Expose()
  @IsNumber()
  @Type(() => Number)
  limit: number;

  @ApiProperty({
    type: Number,
    description: 'Number of records to skip',
    default: 0
  })
  @Expose()
  @IsNumber()
  @Type(() => Number)
  offset: number;

  @ApiProperty({
    type: FiltersProperty,
    description: 'Filter criteria'
  })
  @Expose()
  @IsObject()
  filters: FiltersProperty;

  @ApiPropertyOptional({
    description: 'Sort criteria [field, order]',
    example: ['createdAt', 'desc']
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(2, { message: 'Sort array must contain exactly two elements' })
  @ArrayMaxSize(2, { message: 'Sort array must contain exactly two elements' })
  sort: [string, string];

  @ValidateIf((o) => o.sort !== undefined)
  @IsEnum(SortDirection, {
    each: true,
    message: 'Sort[1] must be either asc or desc'
  })
  get sortDirection(): string | undefined {
    return this.sort ? this.sort[1].toLowerCase() : undefined;
  }

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include display values in the response',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  includeDisplayValues?: boolean;

  constructor(partial: Partial<FormSubmissionSearchDto>) {
    Object.assign(this, partial);
  }
} 