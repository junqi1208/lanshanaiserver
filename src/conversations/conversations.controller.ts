import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/types/request-user.type';
import { AddMessageDto } from './dto/add-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly convService: ConversationsService) {}

  @Post()
  async create(@CurrentUser() user: JwtUser, @Body() dto: CreateConversationDto) {
    return await this.convService.createForUser({ userId: user.userId, title: dto.title });
  }

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    return await this.convService.listForUser(user.userId);
  }

  @Get(':id/messages')
  async messages(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return await this.convService.listMessagesForUser(user.userId, id);
  }

  @Post(':id/messages')
  async addMessage(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
  ) {
    return await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId: id,
      role: dto.role,
      content: dto.content,
    });
  }

  @Patch(':id')
  async rename(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const title = (dto.title || '').trim();
    if (!title) {
      throw new BadRequestException('会话标题不能为空');
    }
    return await this.convService.renameForUser({
      userId: user.userId,
      conversationId: id,
      title,
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.convService.removeForUser(user.userId, id);
    return { success: true };
  }
}

