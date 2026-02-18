import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsUUID } from "class-validator";
import { Expose } from "class-transformer";

export class SaveUserInterestsDto {
  @ApiProperty({
    description: "User Pathway History UUID",
    example: "uph-uuid",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  userPathwayHistoryId: string;

  @ApiProperty({
    description: "Array of Interest UUIDs",
    example: ["i1-uuid", "i2-uuid"],
    type: [String],
  })
  @Expose()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  interestIds: string[];

  @ApiProperty({
    description: "User UUID who created these mapping entries",
    example: "8d2c6e59-91c4-4e9a-9e29-2a3b7b6b1e11",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  created_by: string;
}
