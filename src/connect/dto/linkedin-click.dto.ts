import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class LinkedinClickDto {
  @ApiPropertyOptional({ example: "profile_modal" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
