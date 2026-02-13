import { IsString, IsNotEmpty, MaxLength, IsUUID } from 'class-validator';

export class UpdateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000, { message: 'Message content cannot exceed 5000 characters' })
  content: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;
}

