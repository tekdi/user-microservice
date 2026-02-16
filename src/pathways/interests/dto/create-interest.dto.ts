import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsUUID,
  MaxLength,
} from "class-validator";
import { Expose } from "class-transformer";

export class CreateInterestDto {
  @ApiProperty({
    description: "Associated pathway ID",
    example: "pw1-uuid",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  pathway_id: string;

  @ApiProperty({
    description: "Unique key per pathway",
    example: "internships",
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  key: string;

  @ApiProperty({
    description: "Display label",
    example: "Internships",
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional({
    description: "Default: true",
    example: true,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiProperty({
    description: "User UUID who created this interest",
    example: "8d2c6e59-91c4-4e9a-9e29-2a3b7b6b1e11",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  created_by: string;
}
