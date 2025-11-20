import { Exclude, Expose, Type, Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldValuesOptionDto } from 'src/user/dto/user-create.dto';

export class CohortUpdateDto {
  @Expose()
  cohortId: string;

  @Expose()
  tenantId: string;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;

  //programId
  @ApiPropertyOptional({
    type: String,
    description: 'The programId of the cohort',
  })
  @Expose()
  programId: string;

  //parentId
  @ApiPropertyOptional({
    type: String,
    description: 'The parentId of the cohort',
  })
  @Expose()
  parentId: string;

  //referenceId
  @Expose()
  referenceId: string;

  //name
  @ApiPropertyOptional({
    type: String,
    description: 'The name of the cohort',
  })
  @Expose()
  name: string;

  //type
  @ApiPropertyOptional({
    type: String,
    description: 'The type of the cohort',
  })
  @Expose()
  type: string;

  //status

  // @Expose()
  // status: boolean;

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
  @ApiPropertyOptional({
    type: [FieldValuesOptionDto],
    description: 'The fieldValues Object',
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  customFields: FieldValuesOptionDto[];

  constructor(obj?: Partial<CohortUpdateDto>) {
    if (obj) {
      Object.assign(this, obj);
    }
  }
}
