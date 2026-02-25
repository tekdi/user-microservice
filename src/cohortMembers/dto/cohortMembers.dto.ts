import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsUUID, IsEnum } from "class-validator";
import { MemberStatus } from "../entities/cohort-member.entity";

export class CohortMembersDto {
  //generated fields
  @Expose()
  tenantId: string;
  @Expose()
  cohortMembershipId: string;
  @Expose()
  createdAt: string;
  @Expose()
  updatedAt: string;
  @Expose()
  createdBy: string;
  @Expose()
  updatedBy: string;

  //cohortId
  @ApiProperty({
    type: String,
    description: "The cohortId of the cohort members",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: "Cohort Id must be a valid UUID" })
  cohortId: string;

  @ApiProperty({
    type: String,
    description: "cohortAcademicYearId",
    default: "",
  })
  @Expose()
  @IsOptional()
  @IsUUID(undefined, { message: "cohortAcademicYearId Id must be a valid UUID" })
  cohortAcademicYearId: string;

  //userId
  @ApiProperty({
    type: String,
    description: "The userId of the cohort members",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: "User Id must be a valid UUID" })
  userId: string;

  @ApiProperty({
    enum: MemberStatus,
    description: "Member status (e.g. pending, active)",
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
