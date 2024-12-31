import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
} from "class-validator";

export class BulkCohortMember {
  @ApiProperty({
    type: [String],
    description: "The userIds of the cohort members",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  userId: string[];

  @ApiProperty({
    type: [String],
    description: "The cohortIds of the cohort members",
  })
  @IsArray()
  @IsOptional()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  cohortId: string[];

  @ApiProperty({
    type: [String],
    description: "The cohortIds to be removed from",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsOptional()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  removeCohortId: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
