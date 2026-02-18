import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { FieldValuesOptionDto } from "src/user/dto/user-create.dto";

export class BulkCohortMember {
  @ApiProperty({
    type: [String],
    description: "The userIds of the cohort members",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(1000)
  userId: string[];

  @ApiProperty({
    type: [String],
    description: "The cohortIds of the cohort members",
  })
  @IsArray()
  @IsOptional()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(1000)
  cohortId: string[];

  @ApiProperty({
    type: [String],
    description: "The cohortIds to be removed from",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsOptional()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(1000)
  removeCohortId: string[];


  @ApiProperty({
    type: [FieldValuesOptionDto],
    description: "Array of Custom fields",
  })
  @Expose()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  customFields?: FieldValuesOptionDto[];


  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
