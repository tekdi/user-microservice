import {
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageQueryDto {
  @IsOptional()
  @IsUUID()
  groupId: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsUUID()
  cursor?: string; // message id for cursor-based pagination

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20; // default 20 messages per page

  @IsOptional()
  @IsDateString()
  beforeDate?: string; // alternative cursor using timestamp
}

