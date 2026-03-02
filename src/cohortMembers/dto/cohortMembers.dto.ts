import { Expose, Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

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

  @ApiPropertyOptional({
    type: String,
    description: "Role of the cohort member (stored in uppercase, e.g. POC, PTM)",
    example: "poc",
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
