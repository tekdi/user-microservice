import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, IsOptional } from "class-validator";
import { Expose } from "class-transformer";

export class ActivePathwayDto {
  @ApiProperty({
    description: "User UUID to fetch active pathway for",
    example: "61d1b6bf-c20c-401d-863a-8c85567916e8",
  })
  @Expose()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: "Optional Pathway UUID to check specific assignment status",
    example: "f365cc27-8e24-4065-829d-558f6a639f99",
    required: false,
  })
  @Expose()
  @IsUUID()
  @IsOptional()
  pathwayId?: string;
}
