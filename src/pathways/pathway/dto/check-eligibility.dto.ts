import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";
import { Expose } from "class-transformer";

export class CheckEligibilityDto {
  @ApiProperty({
    description: "User UUID to check eligibility for",
    example: "61d1b6bf-c20c-401d-863a-8c85567916e8",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: "Volunteer Pathway UUID to check eligibility against",
    example: "f365cc27-8e24-4065-829d-558f6a639f99",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  pathwayId: string;
}
