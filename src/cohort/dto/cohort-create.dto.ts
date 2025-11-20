import { Expose, Type, Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldValuesOptionDto } from 'src/user/dto/user-create.dto';

export class CohortCreateDto {
  @Expose()
  cohortId: string;

  @Expose()
  tenantId: string;

  academicYearId: string;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;

  //programId
  @ApiPropertyOptional({
    type: String,
    description: 'The programId of the cohort',
    default: '',
  })
  @Expose()
  programId: string;

  //parentId
  @ApiPropertyOptional({
    type: String,
    description: 'The parentId of the cohort',
    default: '',
  })
  @Expose()
  parentId: string;

  //referenceId
  @Expose()
  referenceId: string;

  //name
  @ApiProperty({
    type: String,
    description: 'The name of the cohort',
    default: '',
  })
  @Expose()
  @IsNotEmpty()
  name: string;

  //type
  @ApiProperty({
    type: String,
    description: 'The type of the cohort',
    default: '',
  })
  @Expose()
  @IsNotEmpty()
  type: string;

  //status
  // @Expose()
  // status: string;
  @ApiProperty({
    type: String,
    description: 'The status of Cohort',
  })
  @IsOptional()
  @IsEnum(['active', 'archived', 'inactive'], {
    message: 'Status must be one of: active, archived, inactive',
  })
  @Expose()
  status: string;

  //attendanceCaptureImage
  @Expose()
  attendanceCaptureImage: boolean;

  //cohort_startDate
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'The start date of the cohort. Accepts various formats: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ssZ, etc.',
    example: '2025-01-01T00:00:00Z',
  })
  @Expose()
  @IsOptional()
  cohort_startDate: string;

  //cohort_endDate
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'The end date of the cohort. Accepts various formats: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ssZ, etc.',
    example: '2025-12-31T23:59:59Z',
  })
  @Expose()
  @IsOptional()
  cohort_endDate: string;

  //image need for future
  // @Expose()
  // @ApiPropertyOptional({ type: "string", format: "binary" })
  // image: string;

  //metadata
  @Expose()
  metadata: string;

  //createdBy
  @Expose()
  createdBy: string;

  //updatedBy
  @Expose()
  updatedBy: string;

  //fieldValues
  //fieldValues
  @ApiPropertyOptional({
    type: [FieldValuesOptionDto],
    description: 'The fieldValues Object',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  customFields: FieldValuesOptionDto[];
  // @ApiPropertyOptional({
  //   type: String,
  //   description: "The fieldValues Object",
  // })
  // @IsString()
  // @IsOptional()
  // @Expose()
  // fieldValues?: string;

  constructor(obj?: Partial<CohortCreateDto>) {
    if (obj) {
      Object.assign(this, obj);
    }
  }
}
