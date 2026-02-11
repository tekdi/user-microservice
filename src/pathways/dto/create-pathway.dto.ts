import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { Expose } from "class-transformer";

export class CreatePathwayDto {
  @ApiProperty({
    description: "Unique key identifier for the pathway",
    example: "career_dev",
    maxLength: 50,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: "Key must not exceed 50 characters" })
  key: string;

  @ApiProperty({
    description: "Display name of the pathway",
    example: "Career Development",
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: "Name must not exceed 100 characters" })
  name: string;

  @ApiPropertyOptional({
    description: "Detailed description of the pathway",
    example: "Build skills for corporate success",
  })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Tags associated with the pathway",
    example: { category: "professional", level: "intermediate" },
  })
  @Expose()
  @IsOptional()
  tags?: Record<string, any>;

  @ApiProperty({
    description: "Display order for sorting pathways",
    example: 1,
    minimum: 0,
  })
  @Expose()
  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: "Display order must be a non-negative number" })
  display_order: number;

  @ApiProperty({
    description: "Whether the pathway is active",
    example: true,
    default: true,
  })
  @Expose()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
