import { Expose, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsArray,
  IsString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FieldValuesOptionDto } from "src/user/dto/user-create.dto";

export class CohortCreateDto {
  @Expose()
  cohortId: string;

  @Expose()
  tenantId: string;

  academicYearId: string;

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
  @IsEnum(["active", "archived", "inactive"], {
    message: "Status must be one of: active, archived, inactive",
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

  //file path
  @ApiPropertyOptional({ type: () => [String] })
  @IsArray()
  @IsString({ each: true })    
  @IsOptional()
  image: string[];

  //metadata
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

export class ReturnResponseBody {
  @Expose()
  cohortId: string;
  @Expose()
  parentId: string;
  @Expose()
  name: string;
  @Expose()
  type: string;
  @Expose()
  status: string;
  @Expose()
  tenantId: string;
  @Expose()
  academicYearId: string;
  @Expose()
  image: string[];

  constructor(cohortDto: CohortCreateDto) {
    this.cohortId = cohortDto.cohortId;
    this.parentId = cohortDto.parentId;
    this.name = cohortDto.name;
    this.type = cohortDto.type;
    this.status = cohortDto.status;
    this.tenantId = cohortDto.tenantId;
    this.academicYearId = cohortDto.academicYearId;
    this.image = cohortDto.image;
  }
}
