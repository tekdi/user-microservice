import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
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
}

