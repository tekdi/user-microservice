import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";
import { Expose } from "class-transformer";
import { TagStatus } from "../entities/tag.entity";

export class DeleteTagDto {
  @ApiProperty({
    description: "Tag ID to delete (soft delete - sets status to archived)",
    example: "a1b2c3d4-e111-2222-3333-444455556666",
  })
  @Expose()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: "Status to set (should be archived)",
    enum: TagStatus,
    example: TagStatus.ARCHIVED,
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsEnum(TagStatus)
  status?: TagStatus;

  @ApiProperty({
    description: "UUID of the user who deleted the tag",
    example: "a1b2c3d4-e111-2222-3333-444455556666",
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  updated_by?: string;
}
