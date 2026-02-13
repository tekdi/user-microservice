import { DiscussionMessage, MessageType } from '../entities/discussion-message.entity';

export class MessageResponseDto {
  messageId: string;
  groupId: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: MessageType;
  replyToMessageId: string | null;
  isEdited: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Optional: include replied message preview
  repliedMessage?: {
    messageId: string;
    senderName: string;
    content: string;
    isDeleted: boolean;
  } | null;

  static fromEntity(message: DiscussionMessage, repliedMessage?: DiscussionMessage | null): MessageResponseDto {
    const dto = new MessageResponseDto();
    dto.messageId = message.messageId;
    dto.groupId = message.groupId;
    dto.senderId = message.senderId;
    dto.senderName = message.senderName;
    dto.content = message.content;
    dto.messageType = message.messageType;
    dto.replyToMessageId = message.replyToMessageId;
    dto.isEdited = message.isEdited;
    dto.deletedAt = message.deletedAt;
    dto.createdAt = message.createdAt;
    dto.updatedAt = message.updatedAt;

    if (repliedMessage) {
      dto.repliedMessage = {
        messageId: repliedMessage.messageId,
        senderName: repliedMessage.senderName,
        content: repliedMessage.deletedAt ? '[Message deleted]' : repliedMessage.content,
        isDeleted: !!repliedMessage.deletedAt,
      };
    }

    return dto;
  }
}

export class PaginatedMessagesResponseDto {
  messages: MessageResponseDto[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number; // optional, can be expensive for large datasets
}

