import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

export class FetchTagDto {
  @ApiProperty({
    description: 'Tag ID to fetch',
    example: 'a1b2c3d4-e111-2222-3333-444455556666',
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;
}

