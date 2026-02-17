import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject, Min, Max } from 'class-validator';

export class PathwayPresignedUrlDto {
  @ApiProperty({
    description: 'Image file name only (no path). Backend builds full key from PATHWAY_STORAGE_KEY_PREFIX env (e.g. pathway-images/pathway/files) + this name.',
    example: 'file_1771313851464_f195e1.png',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Content-Type of the file (e.g. image/png)',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({
    description: 'Presigned URL expiry in seconds',
    example: 3600,
    default: 3600,
    minimum: 60,
    maximum: 86400,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(86400)
  expiresIn?: number;

  @ApiPropertyOptional({
    description: 'Max file size in bytes (validated client-side; server may use for logging)',
    example: 5242880,
  })
  @IsOptional()
  @IsNumber()
  sizeLimit?: number;

  @ApiPropertyOptional({
    description: 'Optional metadata (stored with object)',
    example: {},
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
