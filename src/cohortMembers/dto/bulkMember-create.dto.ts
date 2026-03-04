import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
  IsEnum,
  IsString,
} from "class-validator";
import { MemberStatus } from "../entities/cohort-member.entity";
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

  @ApiProperty({
    enum: MemberStatus,
    description: "Member status (e.g. pending, active)",
    required: false,
  })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
