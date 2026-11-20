import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUUID, Matches } from "class-validator";

export class DistrictUserCountDto {
  @ApiProperty({ description: "Role name", example: "Learner" })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({
    description: "Tenant UUID",
    example: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
  })
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    description: "List of state IDs",
    type: [String],
    example: ["29"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Matches(/^[0-9]+$/, { each: true, message: "each stateId must be numeric" })
  stateId: string[];
}
