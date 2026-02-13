import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;
}

