import {
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, FindOptionsWhere, ILike } from 'typeorm';
import { DiscussionMessage, MessageType } from './entities/discussion-message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { MessageSearchDto } from './dto/message-search.dto';
import {
  MessageResponseDto,
} from './dto/message-response.dto';
import APIResponse from 'src/common/responses/response';
import { APIID } from 'src/common/utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { Response } from 'express';
import { CohortMembers, MemberStatus } from 'src/cohortMembers/entities/cohort-member.entity';

@Injectable()
export class DiscussionService {
  constructor(
    @InjectRepository(DiscussionMessage)
    private readonly messageRepository: Repository<DiscussionMessage>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
  ) {}

  /**
   * Create a new message in a group
   */
  async createMessage(
    createDto: CreateMessageDto,
    senderId: string,
    senderName: string,
    res: Response,
  ) {
    const apiId = APIID.DISCUSSION_MESSAGE_CREATE;
    try {
      // Validate sender is a member of the cohort (group)
      const membership = await this.cohortMembersRepository.findOne({
        where: {
          cohortId: createDto.groupId,
          userId: senderId,
          status: MemberStatus.ACTIVE,
        },
      });

      if (!membership) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.FORBIDDEN,
          'You must be a member of the group to send messages',
          HttpStatus.FORBIDDEN
        );
      }

      // If replying, validate the replied message exists and belongs to same group
      if (createDto.replyToMessageId) {
        const repliedMessage = await this.messageRepository.findOne({
          where: {
            messageId: createDto.replyToMessageId,
            groupId: createDto.groupId,
          },
        });

        if (!repliedMessage) {
          return APIResponse.error(
            res,
            apiId,
            API_RESPONSES.BAD_REQUEST,
            API_RESPONSES.MESSAGE_REPLY_NOT_FOUND,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const message = this.messageRepository.create({
        groupId: createDto.groupId,
        senderId,
        senderName,
        content: createDto.content,
        messageType: createDto.messageType || MessageType.TEXT,
        replyToMessageId: createDto.replyToMessageId || null,
        isEdited: false,
      });

      const savedMessage = await this.messageRepository.save(message);

      // Fetch replied message if exists for response
      let repliedMessage: DiscussionMessage | null = null;
      if (savedMessage.replyToMessageId) {
        repliedMessage = await this.messageRepository.findOne({
          where: { messageId: savedMessage.replyToMessageId },
        });
      }

      const result = MessageResponseDto.fromEntity(savedMessage, repliedMessage);
      
      LoggerUtil.log(
        API_RESPONSES.MESSAGE_CREATED_SUCCESSFULLY,
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.MESSAGE_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get paginated messages for a group (cursor-based pagination)
   */
  async getMessages(
    groupId: string,
    userId: string,
    query: MessageQueryDto,
    res: Response,
  ) {
    const apiId = APIID.DISCUSSION_MESSAGE_GET;
    try {
      // Validate user is a member of the cohort (group)
      const membership = await this.cohortMembersRepository.findOne({
        where: {
          cohortId: groupId,
          userId: userId,
          status: MemberStatus.ACTIVE,
        },
      });

      if (!membership) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.FORBIDDEN,
          'You must be a member of the group to view messages',
          HttpStatus.FORBIDDEN
        );
      }

      const limit = query.limit || 20;
      const where: FindOptionsWhere<DiscussionMessage> = {
        groupId,
        deletedAt: null, // Only show non-deleted messages
      };

      // Cursor-based pagination
      if (query.cursor) {
        const cursorMessage = await this.messageRepository.findOne({
          where: { messageId: query.cursor },
        });

        if (cursorMessage) {
          where.createdAt = LessThan(cursorMessage.createdAt);
        }
      } else if (query.beforeDate) {
        where.createdAt = LessThan(new Date(query.beforeDate));
      }

      const messages = await this.messageRepository.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit + 1, // Fetch one extra to check if there are more
      });

      const hasMore = messages.length > limit;
      const messagesToReturn = hasMore ? messages.slice(0, limit) : messages;

      // Fetch replied messages for context
      const repliedMessageIds = messagesToReturn
        .map((m) => m.replyToMessageId)
        .filter((id): id is string => !!id);

      const repliedMessagesMap = new Map<string, DiscussionMessage>();
      if (repliedMessageIds.length > 0) {
        const repliedMessages = await this.messageRepository.find({
          where: repliedMessageIds.map((id) => ({ messageId: id })),
        });
        repliedMessages.forEach((msg) => repliedMessagesMap.set(msg.messageId, msg));
      }

      const messageDtos = messagesToReturn.map((msg) => {
        const repliedMsg = msg.replyToMessageId
          ? repliedMessagesMap.get(msg.replyToMessageId) || null
          : null;
        return MessageResponseDto.fromEntity(msg, repliedMsg);
      });

      const nextCursor = hasMore && messagesToReturn.length > 0
        ? messagesToReturn[messagesToReturn.length - 1].messageId
        : null;

      const result = {
        messages: messageDtos.reverse(), // Reverse to show oldest first (chronological order)
        nextCursor,
        hasMore,
      };

      LoggerUtil.log(
        API_RESPONSES.MESSAGES_FETCHED_SUCCESSFULLY,
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.MESSAGES_FETCHED_SUCCESSFULLY
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Update a message (only by sender)
   */
  async updateMessage(
    messageId: string,
    updateDto: UpdateMessageDto,
    userId: string,
    res: Response,
  ) {
    const apiId = APIID.DISCUSSION_MESSAGE_UPDATE;
    try {
      const message = await this.messageRepository.findOne({
        where: { messageId: messageId, deletedAt: null },
      });

      if (!message) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.MESSAGE_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      if (message.senderId !== userId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.FORBIDDEN,
          API_RESPONSES.UNAUTHORIZED_MESSAGE_EDIT,
          HttpStatus.FORBIDDEN
        );
      }

      message.content = updateDto.content;
      message.isEdited = true;

      const updatedMessage = await this.messageRepository.save(message);

      // Fetch replied message if exists
      let repliedMessage: DiscussionMessage | null = null;
      if (updatedMessage.replyToMessageId) {
        repliedMessage = await this.messageRepository.findOne({
          where: { messageId: updatedMessage.replyToMessageId },
        });
      }

      const result = MessageResponseDto.fromEntity(updatedMessage, repliedMessage);

      LoggerUtil.log(
        API_RESPONSES.MESSAGE_UPDATED_SUCCESSFULLY,
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.MESSAGE_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Soft delete a message (only by sender)
   */
  async deleteMessage(messageId: string, userId: string, res: Response) {
    const apiId = APIID.DISCUSSION_MESSAGE_DELETE;
    try {
      const message = await this.messageRepository.findOne({
        where: { messageId: messageId, deletedAt: null },
      });

      if (!message) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.MESSAGE_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      if (message.senderId !== userId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.FORBIDDEN,
          API_RESPONSES.UNAUTHORIZED_MESSAGE_DELETE,
          HttpStatus.FORBIDDEN
        );
      }

      await this.messageRepository.softDelete(messageId);

      LoggerUtil.log(
        API_RESPONSES.MESSAGE_DELETED_SUCCESSFULLY,
      );

      return APIResponse.success(
        res,
        apiId,
        { success: true },
        HttpStatus.OK,
        API_RESPONSES.MESSAGE_DELETED_SUCCESSFULLY
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Search messages in a group by content
   */
  async searchMessages(
    searchDto: MessageSearchDto,
    res: Response,
  ) {
    const apiId = APIID.DISCUSSION_MESSAGE_SEARCH;
    try {
      // Validate user is a member of the cohort (group)
      const membership = await this.cohortMembersRepository.findOne({
        where: {
          cohortId: searchDto.groupId,
          userId: searchDto.userId,
          status: MemberStatus.ACTIVE,
        },
      });

      if (!membership) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.FORBIDDEN,
          'You must be a member of the group to search messages',
          HttpStatus.FORBIDDEN
        );
      }

      const limit = searchDto.limit || 20;
      const offset = searchDto.offset || 0;

      // Build search query with case-insensitive search
      const where: FindOptionsWhere<DiscussionMessage> = {
        groupId: searchDto.groupId,
        deletedAt: null, // Only search non-deleted messages
        content: ILike(`%${searchDto.searchQuery}%`), // Case-insensitive search
      };

      // Find messages matching the search query
      const [messages, totalCount] = await this.messageRepository.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });

      // Fetch replied messages for context
      const repliedMessageIds = messages
        .map((m) => m.replyToMessageId)
        .filter((id): id is string => !!id);

      const repliedMessagesMap = new Map<string, DiscussionMessage>();
      if (repliedMessageIds.length > 0) {
        const repliedMessages = await this.messageRepository.find({
          where: repliedMessageIds.map((id) => ({ messageId: id })),
        });
        repliedMessages.forEach((msg) => repliedMessagesMap.set(msg.messageId, msg));
      }

      const messageDtos = messages.map((msg) => {
        const repliedMsg = msg.replyToMessageId
          ? repliedMessagesMap.get(msg.replyToMessageId) || null
          : null;
        return MessageResponseDto.fromEntity(msg, repliedMsg);
      });

      const result = {
        messages: messageDtos,
        totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      };

      if (totalCount === 0) {
        LoggerUtil.log(
          API_RESPONSES.NO_MESSAGES_FOUND,
        );
        return APIResponse.success(
          res,
          apiId,
          result,
          HttpStatus.OK,
          API_RESPONSES.NO_MESSAGES_FOUND
        );
      }

      LoggerUtil.log(
        API_RESPONSES.MESSAGES_SEARCH_SUCCESSFULLY,
      );

      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.MESSAGES_SEARCH_SUCCESSFULLY
      );
    } catch (error) {
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${error.message}`,
        apiId
      );
      const errorMessage = error.message || API_RESPONSES.SERVER_ERROR;
      return APIResponse.error(
        res,
        apiId,
        API_RESPONSES.SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

