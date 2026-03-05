import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/types/request-user.type';
import { AddMessageDto } from './dto/add-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
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
  async list(@CurrentUser() user: JwtUser, @Query() query: ListConversationsDto) {
    return await this.convService.listForUserByPage(user.userId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
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
      reasoning: dto.reasoning,
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const hasTitle = dto.title !== undefined;
    const hasPinned = dto.isPinned !== undefined;
    if (!hasTitle && !hasPinned) {
      throw new BadRequestException('请至少提供一个可更新字段');
    }
    const title = hasTitle ? (dto.title || '').trim() : undefined;
    if (hasTitle && !title) {
      throw new BadRequestException('会话标题不能为空');
    }
    return await this.convService.updateForUser({
      userId: user.userId,
      conversationId: id,
      title,
      isPinned: dto.isPinned,
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.convService.removeForUser(user.userId, id);
    return { success: true };
  }
}

