import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject, Min, Max, Matches } from 'class-validator';

/** Allowed image MIME types for pathway uploads (must match getPathwayConfig). */
const PATHWAY_IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|svg\+xml)$/i;

/** Max file size for pathway image (5 MB). */
export const PATHWAY_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export class PathwayPresignedUrlDto {
  @ApiProperty({
    description: 'Image file name only (no path). Backend builds full key from PATHWAY_STORAGE_KEY_PREFIX env (e.g. pathway-images/pathway/files) + this name.',
    example: 'file_1771313851464_f195e1.png',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Content-Type of the file. Allowed: image/jpeg, image/jpg, image/png, image/svg+xml',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(PATHWAY_IMAGE_MIME_REGEX, {
    message: 'contentType must be one of: image/jpeg, image/jpg, image/png, image/svg+xml',
  })
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
    description: 'Max file size in bytes (capped at 5 MB). Used for presigned POST content-length-range.',
    example: 5242880,
    maximum: PATHWAY_IMAGE_MAX_SIZE_BYTES,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(PATHWAY_IMAGE_MAX_SIZE_BYTES)
  sizeLimit?: number;

  @ApiPropertyOptional({
    description: 'Optional metadata (stored with object)',
    example: {},
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
