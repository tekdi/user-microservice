import { ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsOptional, IsUUID } from "class-validator";
import { CreateInterestDto } from "./create-interest.dto";

export class UpdateInterestDto extends PartialType(
  OmitType(CreateInterestDto, ["pathway_id", "created_by"] as const)
) {
  @ApiPropertyOptional({
    description: "User UUID who updated this interest",
    example: "8d2c6e59-91c4-4e9a-9e29-2a3b7b6b1e11",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsOptional()
  updated_by?: string;
}
