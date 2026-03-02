import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
  IsString,
} from "class-validator";
import { Expose, Transform } from "class-transformer";

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

  @ApiPropertyOptional({
    type: String,
    description: "Role of the cohort member (stored in uppercase, e.g. POC, PTM)",
    example: "ptm",
  })
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? value.toUpperCase() : value))
  cohortMemberRole: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
