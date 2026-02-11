import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListPathwayDto extends PaginationDto {
  @ApiPropertyOptional({
    description: "Filter pathways by active status",
    example: true,
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
