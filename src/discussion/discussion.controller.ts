import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { DiscussionService } from './discussion.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { MessageSearchDto } from './dto/message-search.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import {
  MessageResponseDto,
  PaginatedMessagesResponseDto,
} from './dto/message-response.dto';

// TODO: Replace with your actual auth guard
// @UseGuards(JwtAuthGuard)
@Controller('discussions')
export class DiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  @Post('groups/messages')
  @HttpCode(HttpStatus.CREATED)
  async createMessage(
    
    @Body() createDto: CreateMessageDto,
    @Res() res: Response,
  ) {
    return this.discussionService.createMessage(
      createDto,
      createDto.userId,
      createDto.userName,
      res,
    );
  }

  @Get('groups/messages')
  async getMessages(
    @Query() query: MessageQueryDto,
    @Res() res: Response,
  ) {
    return this.discussionService.getMessages(query.groupId, query.userId, query, res);
  }

  @Put('messages/:messageId')
  async updateMessage(
    @Param('messageId') messageId: string,
    @Body() updateDto: UpdateMessageDto,
    @Res() res: Response,
  ) {
    return this.discussionService.updateMessage(
      messageId,
      updateDto,
      updateDto.userId,
      res,
    );
  }

  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @Param('messageId') messageId: string,
    @Query('userId') userId: string,
    @Res() res: Response,
  ) {
    return this.discussionService.deleteMessage(messageId, userId, res);
  }

  @Get('groups/search')
  async searchMessages(
    @Query() searchDto: MessageSearchDto,
    @Res() res: Response,
  ) {
    return this.discussionService.searchMessages(searchDto, res);
  }

  // @Post('groups/:groupId/mark-read')
  // @HttpCode(HttpStatus.NO_CONTENT)
  // async markAsRead(
  //   @Param('groupId') groupId: string,
  //   @Body() markReadDto: MarkReadDto,
  // ): Promise<void> {
  //   const lastReadAt = markReadDto.lastReadAt
  //     ? new Date(markReadDto.lastReadAt)
  //     : undefined;
  //   return this.discussionService.markAsRead(
  //     groupId,
  //     markReadDto.userId,
  //     markReadDto.lastReadMessageId,
  //     lastReadAt,
  //   );
  // }

  // @Get('groups/:groupId/unread-count')
  // async getUnreadCount(
  //   @Param('groupId') groupId: string,
  //   @Query('userId') userId: string,
  // ): Promise<{ count: number }> {
  //   const count = await this.discussionService.getUnreadCount(
  //     groupId,
  //     userId,
  //   );
  //   return { count };
  // }
}

