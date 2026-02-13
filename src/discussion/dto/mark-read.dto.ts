import { IsUUID, IsOptional, IsDateString, IsNotEmpty } from 'class-validator';

export class MarkReadDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsOptional()
  lastReadMessageId?: string;

  @IsOptional()
  @IsDateString()
  lastReadAt?: string;
}

