import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';
import { TagStatus } from '../entities/tag.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListTagDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter tags by status',
    enum: TagStatus,
    example: TagStatus.PUBLISHED,
  })
  @Expose()
  @IsOptional()
  @IsEnum(TagStatus, {
    message: 'Status must be either "published" or "archived"',
  })
  status?: TagStatus;
}

