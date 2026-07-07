import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID, IsOptional, IsEnum } from "class-validator";
import { Expose } from "class-transformer";
import { PathwayType } from '../entities/pathway.entity';

export class ActivePathwayDto {
  @ApiProperty({
    description: "User UUID to fetch active pathway for",
    example: "61d1b6bf-c20c-401d-863a-8c85567916e8",
  })
  @Expose()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: "Optional Pathway UUID to check specific assignment status",
    example: "f365cc27-8e24-4065-829d-558f6a639f99",
  })
  @Expose()
  @IsUUID()
  @IsOptional()
  pathwayId?: string;

  @ApiPropertyOptional({
    description: "Filter by pathway type. STANDARD (default) returns the single active career pathway. VOLUNTEER returns all active volunteer pathway assignments as an array. ALL returns both.",
    enum: PathwayType,
    default: PathwayType.STANDARD,
    example: PathwayType.STANDARD,
  })
  @Expose()
  @IsEnum(PathwayType)
  @IsOptional()
  pathwayType?: PathwayType;
}
