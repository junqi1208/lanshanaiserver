import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Message } from '../conversations/entities/message.entity';
import { Share } from './entities/share.entity';

type ShareMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ShareGroup = {
  groupId: string;
  messages: ShareMessage[];
};

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepo: Repository<Share>,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
  ) {}

  private buildGroups(messages: Message[]): ShareGroup[] {
    const groups: ShareGroup[] = [];
    let currentGroupId = '';

    messages.forEach((msg) => {
      const isUser = msg.role === 'user';
      if (isUser) {
        currentGroupId = `u_${msg.id}`;
      } else if (!currentGroupId) {
        currentGroupId = `m_${msg.id}`;
      }
      const targetGroup = groups.find((g) => g.groupId === currentGroupId);
      const nextMsg: ShareMessage = {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      };
      if (targetGroup) {
        targetGroup.messages.push(nextMsg);
        return;
      }
      groups.push({
        groupId: currentGroupId,
        messages: [nextMsg],
      });
    });

    return groups;
  }

  async createShare(params: {
    userId: string;
    conversationId: string;
    groupIds: string[];
  }) {
    const conversation = await this.convRepo.findOne({
      where: { id: params.conversationId, userId: params.userId },
    });
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    const messages = await this.msgRepo.find({
      where: { conversationId: params.conversationId },
      order: { createdAt: 'ASC' },
    });
    const groups = this.buildGroups(messages);
    const selectedSet = new Set(params.groupIds);
    const selectedGroups = groups.filter((group) => selectedSet.has(group.groupId));
    if (!selectedGroups.length) {
      throw new BadRequestException('未找到可分享的对话组');
    }

    const token = randomBytes(12).toString('hex');
    const snapshot = JSON.stringify({
      conversationId: conversation.id,
      title: conversation.title || '未命名会话',
      groups: selectedGroups,
    });
    const share = this.shareRepo.create({
      token,
      userId: params.userId,
      conversationId: conversation.id,
      title: conversation.title || '未命名会话',
      snapshot,
    });
    const saved = await this.shareRepo.save(share);
    return {
      token: saved.token,
      sharePath: `/share/${saved.token}`,
      createdAt: saved.createdAt,
    };
  }

  async getShareByToken(token: string) {
    const share = await this.shareRepo.findOne({ where: { token } });
    if (!share) {
      throw new NotFoundException('分享不存在或已失效');
    }
    const parsed = JSON.parse(share.snapshot || '{}');
    return {
      token: share.token,
      title: share.title,
      createdAt: share.createdAt,
      conversationId: share.conversationId,
      groups: parsed.groups || [],
    };
  }
}

