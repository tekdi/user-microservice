import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

export class DeleteTagDto {
  @ApiProperty({
    description: 'Tag ID to delete (soft delete - sets status to archived)',
    example: 'a1b2c3d4-e111-2222-3333-444455556666',
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;
}

