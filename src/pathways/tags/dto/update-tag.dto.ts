import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";
import { Expose } from "class-transformer";
import { TagStatus } from "../entities/tag.entity";

export class UpdateTagDto {
  @ApiPropertyOptional({
    description: "Name of the tag",
    example: "Professional Networking",
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Name must not exceed 100 characters" })
  name?: string;

  @ApiPropertyOptional({
    description: "Status of the tag",
    enum: TagStatus,
    example: TagStatus.PUBLISHED,
  })
  @Expose()
  @IsOptional()
  @IsEnum(TagStatus, {
    message: 'Status must be either "published" or "archived"',
  })
  status?: TagStatus;

  @ApiPropertyOptional({
    description: "URL-friendly alias for the tag",
    example: "professional_networking",
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Alias must not exceed 100 characters" })
  alias?: string;

  @ApiPropertyOptional({
    description: "UUID of the user who updated the tag",
    example: "a1b2c3d4-e111-2222-3333-444455556666",
  })
  @Expose()
  @IsOptional()
  @IsString()
  updated_by?: string;
}
