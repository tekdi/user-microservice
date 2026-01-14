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
  createdAt: string;

  @Expose()
  updatedAt: string;

  //programId
  @ApiPropertyOptional({
    type: String,
    description: "The programId of the cohort",
    default: "",
  })
  @Expose()
  programId: string;

  //parentId
  @ApiPropertyOptional({
    type: String,
    description: "The parentId of the cohort",
    default: "",
  })
  @Expose()
  parentId: string;

  //referenceId
  @Expose()
  referenceId: string;

  //name
  @ApiProperty({
    type: String,
    description: "The name of the cohort",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  name: string;

  //type
  @ApiProperty({
    type: String,
    description: "The type of the cohort",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  type: string;

  //status
  // @Expose()
  // status: string;
  @ApiProperty({
    type: String,
    description: "The status of Cohort",
  })
  @IsOptional()
  @IsEnum(["active", "archived", "inactive"], {
    message: "Status must be one of: active, archived, inactive",
  })
  @Expose()
  status: string;

  //attendanceCaptureImage
  @Expose()
  attendanceCaptureImage: boolean;

  //file path
  @ApiPropertyOptional({ type: () => [String] })
  @IsArray()
  @IsString({ each: true })    
  @IsOptional()
  image: string[];

  //metadata
  @ApiPropertyOptional({
    type: String,
    description: "Metadata as JSON string (e.g., '{\"blockId\": \"881\"}')",
    example: '{"blockId": "881"}',
  })
  @Expose()
  @IsOptional()
  @IsString()
  metadata?: string;

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
    description: "The fieldValues Object",
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
