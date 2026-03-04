import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
  IsEnum,
} from "class-validator";
import { MemberStatus } from "../entities/cohort-member.entity";

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
