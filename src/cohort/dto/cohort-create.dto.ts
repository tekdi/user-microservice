import { Expose, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsString,
  IsNumber
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FieldValuesOptionDto } from "src/user/dto/user-create.dto";

// export class SelfDto {
//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   allowed: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   back_dated_attendance: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   restrict_attendance_timings: number;

//   @ApiProperty({ type: String })
//   @Expose()
//   @IsNotEmpty()
//   @IsString()
//   attendance_starts_at: string;

//   @ApiProperty({ type: String })
//   @Expose()
//   @IsNotEmpty()
//   @IsString()
//   attendance_ends_at: string;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   allow_late_marking: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   capture_geoLocation: number;
// }

// export class StudentDto {
//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   allowed: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   back_dated_attendance: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   back_dated_attendance_allowed_days: number;

//   @ApiProperty({ type: Number })
//   @Expose()
//   @IsNotEmpty()
//   @IsNumber()
//   restrict_attendance_timings: number;

//   @ApiProperty({ type: String, required: false })
//   @Expose()
//   @IsOptional()
//   @IsString()
//   attendance_starts_at?: string;

//   @ApiProperty({ type: String, required: false })
//   @Expose()
//   @IsOptional()
//   @IsString()
//   attendance_ends_at?: string;

//   @ApiProperty({ type: Number, required: false })
//   @Expose()
//   @IsOptional()
//   @IsNumber()
//   capture_geoLocation?: number;

//   @ApiProperty({ type: Number, required: false })
//   @Expose()
//   @IsOptional()
//   @IsNumber()
//   allow_late_marking?: number;
// }

export class CohortCreateDto {
  @Expose()
  cohortId: string;

  @Expose()
  tenantId: string;

  @Expose()
  @IsOptional()
  createdAt?: string;

  @Expose()
  @IsOptional()
  updatedAt?: string;

  // programId
  @ApiPropertyOptional({
    type: String,
    description: "The programId of the cohort",
    default: "",
  })
  @Expose()
  @IsOptional()
  programId?: string;

  // parentId
  @ApiPropertyOptional({
    type: String,
    description: "The parentId of the cohort",
    default: "",
  })
  @Expose()
  @IsOptional()
  parentId?: string;

  // referenceId
  @Expose()
  referenceId: string;

  // name
  @ApiProperty({
    type: String,
    description: "The name of the cohort",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  name: string;

  // type
  @ApiProperty({
    type: String,
    description: "The type of the cohort",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    type: String,
    description: "The status of Cohort",
  })
  @IsOptional()
  @IsEnum(['active', 'archived', 'inactive'], {
    message: 'Status must be one of: active, archived, inactive',
  })
  @Expose()
  status?: string;

  // attendanceCaptureImage
  @ApiProperty({
    type: Boolean,
    description: "Capture image while marking the attendance",
    default: false,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  attendanceCaptureImage?: boolean;

  // metadata
  @ApiPropertyOptional({
    type: String,
    description: "Additional metadata for the cohort",
    default: "",
  })
  @Expose()
  @IsString()
  @IsOptional()
  metadata?: string;

  // createdBy
  @Expose()
  @IsString()
  @IsOptional()
  createdBy?: string;

  // updatedBy
  @Expose()
  @IsString()
  @IsOptional()
  updatedBy?: string;

  // fieldValues
  @ApiPropertyOptional({
    type: [FieldValuesOptionDto],
    description: "The fieldValues Object",
  })
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  @IsOptional()
  customFields?: FieldValuesOptionDto[];

  @ApiPropertyOptional({
    type: Object,
    description: "Cohort attendance params",
    default: {},
  })
  @Expose()
  params: object;

  constructor(obj?: Partial<CohortCreateDto>) {
    if (obj) {
      Object.assign(this, obj);
    }
  }
}
