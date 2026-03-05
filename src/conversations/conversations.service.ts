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

  async listForUser(userId: string): Promise<Conversation[]> {
    return await this.convRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
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
  }): Promise<Message> {
    await this.getForUser(params.userId, params.conversationId);
    const msg = this.msgRepo.create({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
    });
    const saved = await this.msgRepo.save(msg);
    await this.convRepo.update(
      { id: params.conversationId },
      { updatedAt: new Date() },
    );
    return saved;
  }

  async renameForUser(params: {
    userId: string;
    conversationId: string;
    title: string;
  }): Promise<Conversation> {
    const conv = await this.getForUser(params.userId, params.conversationId);
    conv.title = params.title;
    return await this.convRepo.save(conv);
  }

  async removeForUser(userId: string, conversationId: string): Promise<void> {
    const conv = await this.getForUser(userId, conversationId);
    await this.convRepo.remove(conv);
  }
}

