/**
 * Group Discussion Module - Public API
 * 
 * Export all public interfaces, DTOs, and entities for external use
 */

// Module
export { DiscussionModule } from './discussion.module';

// Service
export { DiscussionService } from './discussion.service';

// Controller
export { DiscussionController } from './discussion.controller';

// Entities
export { DiscussionMessage, MessageType } from './entities/discussion-message.entity';

// DTOs
export { CreateMessageDto } from './dto/create-message.dto';
export { UpdateMessageDto } from './dto/update-message.dto';
export { MessageQueryDto } from './dto/message-query.dto';
export { MessageResponseDto, PaginatedMessagesResponseDto } from './dto/message-response.dto';
export { MarkReadDto } from './dto/mark-read.dto';

// Interfaces
export { IGroupMember, IGroupMemberRepository } from './interfaces/group-member.interface';

