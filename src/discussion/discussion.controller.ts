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
}

