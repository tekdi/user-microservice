import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { MessageType } from '../entities/discussion-message.entity';

export class CreateMessageDto {
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;
}

