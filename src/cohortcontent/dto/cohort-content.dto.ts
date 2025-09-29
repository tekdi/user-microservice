import { Expose } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUUID, IsOptional } from "class-validator";

export class CohortContentDto {
  @Expose()
  @ApiPropertyOptional({ type: String, description: "Auto-generated UUID" })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  contentId: string;

  @ApiProperty({ type: String, description: "FK to Cohort.cohortId" })
  @IsNotEmpty()
  @IsUUID()
  cohortId: string;

  @ApiProperty({ type: String, description: "FK to Tenant.tenantId" })
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: "Arbitrary JSON params" })
  @IsOptional()
  params?: object;

  @ApiPropertyOptional({
    type: String,
    description: "User who created the record",
  })
  @IsUUID()
  userId: string;

  constructor(obj?: any) {
    Object.assign(this, obj);
  }
}

export class UpdateCohortContentDto {
  @ApiPropertyOptional({ type: String })
  @IsString()
  contentId: string;

  @ApiPropertyOptional({ type: String, description: "FK to Cohort.cohortId" })
  @IsUUID()
  cohortId: string;

  @ApiPropertyOptional({ type: String, description: "FK to Tenant.tenantId" })
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: "add/remove from group" })
  @IsString()
  status: "archive" | "active";
}
