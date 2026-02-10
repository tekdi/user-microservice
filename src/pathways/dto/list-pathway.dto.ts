import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class ListPathwayDto {
  @ApiPropertyOptional({
    description: 'Filter pathways by active status',
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

