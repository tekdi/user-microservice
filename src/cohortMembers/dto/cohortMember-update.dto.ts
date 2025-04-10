import { Exclude, Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { MemberStatus } from "../entities/cohort-member.entity";
import { FieldValuesOptionDto } from "src/user/dto/user-create.dto";
export class CohortMembersUpdateDto {
  @Expose()
  tenantId: string;

  @Expose()
  cohortMembershipId: string;

  @Expose()
  @IsOptional()
  createdAt: string;

  @Expose()
  @IsOptional()
  updatedAt: string;

  @ApiProperty({
    type: String,
    description: "The cohortId of the cohort members",
  })
  @Expose()
  @IsOptional() // Marking as optional
  cohortId?: string; // Making it optional by adding '?' after the type

  @ApiProperty({
    type: String,
    description: "The userId of the cohort members",
  })
  @Expose()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    enum: MemberStatus,
    description: "The status of the cohort members",
  })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: string;

  @ApiProperty({
    type: String,
    description: "The createdBy of the cohort members",
  })
  @Expose()
  @IsOptional()
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: "The updatedBy of the cohort members",
  })
  @Expose()
  @IsOptional()
  updatedBy?: string;

  @ApiProperty({
    type: String,
    description: "The status change reason",
  })
  @ValidateIf((o) => o.status === MemberStatus.DROPOUT)
  @IsString({ message: "Reason is mandatory while dropping out a member" })
  statusReason?: string;
  @ApiProperty({
    type: FieldValuesOptionDto,
    description: "Array of Custom fields",
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FieldValuesOptionDto)
  customFields?: FieldValuesOptionDto[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
