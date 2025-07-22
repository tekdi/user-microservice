import { IsNotEmpty, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class CohortAcademicYearDto {
  @ApiProperty({
    type: String,
    description: "cohortId",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: "Cohort Id must be a valid UUID" })
  cohortId: string;

  @ApiProperty({
    type: String,
    description: "academicYearId",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: "Academic Year Id must be a valid UUID" })
  academicYearId: string;

  createdBy: string;

  updatedBy: string;
}
