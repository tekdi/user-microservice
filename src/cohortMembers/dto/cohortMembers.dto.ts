import { Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID, IsOptional, IsString, IsArray, IsEnum, ValidateNested } from "class-validator";
import { MemberStatus } from "../entities/cohort-member.entity";

export class CustomFieldDto {
  @ApiProperty({
    type: String,
    description: "The unique identifier of the field",
  })
  @IsUUID(undefined, { message: "Field ID must be a valid UUID" })
  @IsNotEmpty()
  fieldId: string;

  @ApiProperty({
    description: "The value of the custom field",
    example: "Some value or array of values",
  })
  @IsNotEmpty()
  value: string | string[];
}

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
  @IsNotEmpty()
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
    description: "The status of the cohort member",
    default: MemberStatus.APPLIED,
  })
  @Expose()
  @IsOptional()
  @IsEnum(MemberStatus, {
    message: "Status must be one of the following values: " + Object.values(MemberStatus).join(", ")
  })
  status: MemberStatus;

  @ApiProperty({
    type: String,
    description: "The reason for the status",
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  statusReason?: string;

  @ApiProperty({
    type: [CustomFieldDto],
    description: "Custom fields for the cohort member",
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDto)
  customFields?: CustomFieldDto[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
