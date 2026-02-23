import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  ArrayUnique,
} from 'class-validator';

export class CreateContentDto {
  @ApiProperty({
    description: 'Name of the content',
    example: 'Cricket',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Unique alias for the content (auto-generated from name if not provided)',
    example: 'cricket',
    required: false,
  })
  @IsString()
  @IsOptional()
  alias?: string;

  @ApiProperty({
    description: 'Full HTML text content',
    example: '<p>Content HTML content</p>',
  })
  @IsString()
  @IsNotEmpty()
  fulltext: string;

  @ApiProperty({
    description: 'Additional parameters in JSON format',
    example: { discord_link: 'https://discord.gg/example' },
    required: false,
  })
  @IsOptional()
  params?: any;
  
  @ApiProperty({
    description: 'Creator User UUID',
    example: 'fa023e44-7bcf-43fc-9099-7ca4193a985f',
  })
  @IsUUID()
  @IsNotEmpty()
  createdBy: string;

  @ApiProperty({
    description: 'Whether the content is active',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Updater User UUID',
    example: 'fa023e44-7bcf-43fc-9099-7ca4193a985f',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  updatedBy?: string;
}
