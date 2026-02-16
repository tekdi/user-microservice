import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateTagDto {
  @ApiProperty({
    description: 'Name of the tag',
    example: 'Networking',
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @ApiProperty({
    description: 'URL-friendly alias for the tag (optional)',
    example: 'networking_tips',
    maxLength: 100,
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Alias must not exceed 100 characters' })
  alias?: string;

  @ApiProperty({
    description: 'UUID of the user who created the tag',
    example: 'a1b2c3d4-e111-2222-3333-444455556666',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  created_by?: string;
}

