import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
  ) {}

  async createForUser(params: {
    userId: string;
    title?: string;
  }): Promise<Conversation> {
    const conv = this.convRepo.create({
      userId: params.userId,
      title: params.title,
    });
    return await this.convRepo.save(conv);
  }

  async listForUserByPage(
    userId: string,
    params: { page: number; pageSize: number },
  ): Promise<{
    items: Conversation[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const [items, total] = await this.convRepo.findAndCount({
      where: { userId },
      order: { isPinned: 'DESC', updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  async getForUser(userId: string, conversationId: string): Promise<Conversation> {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    return conv;
  }

  async listMessagesForUser(userId: string, conversationId: string): Promise<Message[]> {
    await this.getForUser(userId, conversationId);
    return await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async addMessageForUser(params: {
    userId: string;
    conversationId: string;
    role: MessageRole;
    content: string;
    reasoning?: string;
  }): Promise<Message> {
    await this.getForUser(params.userId, params.conversationId);
    const msg = this.msgRepo.create({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      reasoning: params.reasoning,
    });
    const saved = await this.msgRepo.save(msg);
    await this.convRepo.update(
      { id: params.conversationId },
      { updatedAt: new Date() },
    );
    return saved;
  }

  async updateForUser(params: {
    userId: string;
    conversationId: string;
    title?: string;
    isPinned?: boolean;
  }): Promise<Conversation> {
    const conv = await this.getForUser(params.userId, params.conversationId);
    if (params.title !== undefined) {
      conv.title = params.title;
    }
    if (params.isPinned !== undefined) {
      conv.isPinned = params.isPinned;
    }
    return await this.convRepo.save(conv);
  }

  async removeForUser(userId: string, conversationId: string): Promise<void> {
    const conv = await this.getForUser(userId, conversationId);
    await this.convRepo.remove(conv);
  }
}

