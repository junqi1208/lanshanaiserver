import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Response } from 'express';
import { ConversationsService } from '../conversations/conversations.service';
import { FilesService } from '../files/files.service';
import type { JwtUser } from '../common/types/request-user.type';
import { modelSupportsImage } from './dto/ask.dto';

type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const MAX_HISTORY_MESSAGES = 40;
const MAX_ENRICHED_PROMPT_CHARS = 32000;

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly convService: ConversationsService,
    private readonly filesService: FilesService,
  ) {}

  private resolveModel(baseUrl: string, deepThinking?: boolean): string {
    const normalModel =
      this.config.get<string>('OPENAI_MODEL') ??
      this.config.get<string>('DEEPSEEK_MODEL') ??
      'gpt-4o-mini';
    if (!deepThinking) return normalModel;
    const isDeepSeek = /deepseek/i.test(baseUrl);
    if (!isDeepSeek) return normalModel;
    return this.config.get<string>('DEEPSEEK_REASONER_MODEL') ?? 'deepseek-reasoner';
  }

  private getLangchainBaseUrl() {
    return this.config.get<string>('LANGCHAIN_SERVER_BASE_URL') ?? 'http://127.0.0.1:8000';
  }

  private getLangchainTimeoutMs() {
    return Number(this.config.get<string>('LANGCHAIN_SERVER_TIMEOUT_MS') ?? '120000');
  }

  private getLangchainHeaders(): Record<string, string> {
    const apiKey = (this.config.get<string>('LANGCHAIN_SERVER_API_KEY') ?? '').trim();
    return apiKey ? { 'X-Internal-Api-Key': apiKey } : {};
  }

  private trimEnrichedPrompt(prompt: string): string {
    if (prompt.length <= MAX_ENRICHED_PROMPT_CHARS) return prompt;
    return `${prompt.slice(0, MAX_ENRICHED_PROMPT_CHARS)}\n\n【提示：附件内容过长，已截断】`;
  }

  private mapHistoryMessages(
    messages: Array<{ role: string; content: string }>,
  ): OpenAIChatMessage[] {
    return messages.map((m) => ({
      role: m.role as OpenAIChatMessage['role'],
      content: m.content,
    }));
  }

  private async rollbackFailedTurn(
    user: JwtUser,
    conversationId: string,
    userMessageId: string,
    isNewConversation: boolean,
  ) {
    try {
      await this.convService.removeMessageForUser(user.userId, conversationId, userMessageId);
    } catch {
      // ignore rollback failure
    }
    if (isNewConversation) {
      try {
        await this.convService.removeConversationIfEmpty(user.userId, conversationId);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  private async buildPromptWithAttachments(
    user: JwtUser,
    prompt: string,
    fileIds?: string[],
  ): Promise<string> {
    if (!fileIds?.length) return prompt;

    const attachments = await this.filesService.getTextsForUser(user.userId, fileIds);
    if (!attachments.length) return prompt;

    const attachmentBlocks = attachments.map(
      (item) => `--- 文件：${item.originalName} ---\n${item.text}`,
    );

    return [
      prompt,
      '',
      '【用户上传的附件内容，请结合以下内容回答】',
      ...attachmentBlocks,
    ].join('\n');
  }

  private async buildAttachmentsPayload(
    user: JwtUser,
    fileIds?: string[],
  ): Promise<string | undefined> {
    if (!fileIds?.length) return undefined;
    const metas = await this.filesService.getMetasForUser(user.userId, fileIds);
    return metas.length ? JSON.stringify(metas) : undefined;
  }

  private async buildImagesPayload(user: JwtUser, fileIds?: string[]) {
    if (!fileIds?.length) return [];
    const images = await this.filesService.getImagesForUser(user.userId, fileIds);
    return images.map((item) => ({
      mimeType: item.mimeType,
      base64: item.base64,
    }));
  }

  private async validateAttachmentsForModel(
    user: JwtUser,
    fileIds: string[] | undefined,
    modelId?: string,
  ) {
    if (!fileIds?.length) return;
    const images = await this.filesService.getImagesForUser(user.userId, fileIds);
    if (images.length && !modelSupportsImage(modelId)) {
      throw new BadRequestException('当前模型不支持图片识别，请切换到 Qwen VL Max');
    }
  }

  async ask(
    user: JwtUser,
    params: {
      conversationId?: string;
      prompt: string;
      deepThinking?: boolean;
      fileIds?: string[];
      replyStyle?: string;
      modelId?: string;
    },
  ) {
    const isNewConversation = !params.conversationId;
    const conversationId =
      params.conversationId ??
      (await this.convService.createForUser({
        userId: user.userId,
        title: params.prompt.slice(0, 30),
      })).id;

    const modelId = params.modelId || 'deepseek-v4-flash';
    const deepThinking = params.deepThinking ?? modelId === 'deepseek-v4-pro';

    await this.validateAttachmentsForModel(user, params.fileIds, modelId);

    const priorHistory = await this.convService.listRecentMessagesForUser(
      user.userId,
      conversationId,
      MAX_HISTORY_MESSAGES,
    );
    const enrichedPrompt = this.trimEnrichedPrompt(
      await this.buildPromptWithAttachments(user, params.prompt, params.fileIds),
    );
    const images = await this.buildImagesPayload(user, params.fileIds);

    const userMessage = await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId,
      role: 'user',
      content: params.prompt,
      attachments: await this.buildAttachmentsPayload(user, params.fileIds),
    });

    const url = `${this.getLangchainBaseUrl().replace(/\/$/, '')}/chat`;
    const timeoutMs = this.getLangchainTimeoutMs();
    let answer: string | undefined;
    let reasoning: string | undefined;
    try {
      const resp = await axios.post(
        url,
        {
          conversationId,
          prompt: enrichedPrompt,
          deepThinking,
          replyStyle: params.replyStyle,
          modelId,
          images,
          userId: user.userId,
          messages: this.mapHistoryMessages(priorHistory),
        },
        { timeout: timeoutMs, headers: this.getLangchainHeaders() },
      );
      answer = resp.data?.answer;
      reasoning = resp.data?.reasoning;
    } catch (e: any) {
      await this.rollbackFailedTurn(user, conversationId, userMessage.id, isNewConversation);
      const msg = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'AI 请求失败';
      throw new BadRequestException(msg);
    }

    if (!answer) {
      await this.rollbackFailedTurn(user, conversationId, userMessage.id, isNewConversation);
      throw new BadRequestException('AI 返回内容为空');
    }

    await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId,
      role: 'assistant',
      content: answer,
      reasoning: reasoning || undefined,
    });

    return { conversationId, answer };
  }

  async summarizeTitle(user: JwtUser, conversationId: string) {
    const conv = await this.convService.getForUser(user.userId, conversationId);
    if (conv.title?.trim()) {
      return { conversationId, title: conv.title };
    }

    const history = await this.convService.listMessagesForUser(user.userId, conversationId);
    const firstUser = history.find((m) => m.role === 'user')?.content?.trim() || '';
    const firstAssistant = history.find((m) => m.role === 'assistant')?.content?.trim() || '';

    if (!firstUser || !firstAssistant) {
      throw new BadRequestException('首轮问答尚未完成，无法生成标题');
    }

    const model =
      this.config.get<string>('OPENAI_MODEL') ??
      this.config.get<string>('DEEPSEEK_MODEL') ??
      'gpt-4o-mini';
    const baseUrl =
      this.config.get<string>('OPENAI_BASE_URL') ??
      this.config.get<string>('DEEPSEEK_BASE_URL') ??
      'https://api.openai.com';
    const openaiApiKey =
      this.config.get<string>('OPENAI_API_KEY') ?? this.config.get<string>('AI_API_KEY');
    const deepseekApiKey =
      this.config.get<string>('DEEPSEEK_API_KEY') ?? this.config.get<string>('AI_API_KEY');
    const base = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    const url = `${base}/v1/chat/completions`;
    const timeoutMs = Number(this.config.get<string>('OPENAI_TIMEOUT_MS') ?? '60000');

    const getApiKeyForUpstream = (upstreamUrl: string) => {
      const isDeepSeek = /deepseek/i.test(upstreamUrl);
      const picked = isDeepSeek
        ? (deepseekApiKey ?? openaiApiKey)
        : (openaiApiKey ?? deepseekApiKey);
      if (!picked) {
        throw new BadRequestException(
          isDeepSeek
            ? '未配置 DEEPSEEK_API_KEY（或 OPENAI_API_KEY / AI_API_KEY）'
            : '未配置 OPENAI_API_KEY（或 DEEPSEEK_API_KEY / AI_API_KEY）',
        );
      }
      return picked;
    };

    const prompt = `请根据下面这轮问答，生成一个简洁的会话标题。
要求：
1) 8-18 个中文字符；
2) 不要标点符号；
3) 不要引号；
4) 只返回标题正文，不要解释。

用户问题：${firstUser}
助手回答：${firstAssistant}`;

    const resp = await axios.post(
      url,
      {
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是一个擅长提炼标题的助手。' },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${getApiKeyForUpstream(url)}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      },
    );

    const rawTitle: string = (resp.data?.choices?.[0]?.message?.content || '').trim();
    if (!rawTitle) {
      throw new BadRequestException('标题生成失败');
    }

    const normalizedTitle = rawTitle
      .replace(/[\r\n]/g, ' ')
      .replace(/[“”"'`]/g, '')
      .replace(/[，。！？；：,.!?;:]/g, '')
      .trim()
      .slice(0, 30);

    const saved = await this.convService.updateForUser({
      userId: user.userId,
      conversationId,
      title: normalizedTitle || firstUser.slice(0, 30),
    });

    return { conversationId, title: saved.title || '' };
  }

  async askStream(
    user: JwtUser,
    params: {
      conversationId?: string;
      prompt: string;
      deepThinking?: boolean;
      fileIds?: string[];
      replyStyle?: string;
      modelId?: string;
    },
    res: Response,
  ) {
    const isNewConversation = !params.conversationId;
    const conversationId =
      params.conversationId ??
      (await this.convService.createForUser({
        userId: user.userId,
        title: params.prompt.slice(0, 30),
      })).id;

    const modelId = params.modelId || 'deepseek-v4-flash';
    const deepThinking = params.deepThinking ?? modelId === 'deepseek-v4-pro';

    await this.validateAttachmentsForModel(user, params.fileIds, modelId);

    const priorHistory = await this.convService.listRecentMessagesForUser(
      user.userId,
      conversationId,
      MAX_HISTORY_MESSAGES,
    );
    const enrichedPrompt = this.trimEnrichedPrompt(
      await this.buildPromptWithAttachments(user, params.prompt, params.fileIds),
    );
    const images = await this.buildImagesPayload(user, params.fileIds);

    const userMessage = await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId,
      role: 'user',
      content: params.prompt,
      attachments: await this.buildAttachmentsPayload(user, params.fileIds),
    });

    const url = `${this.getLangchainBaseUrl().replace(/\/$/, '')}/chat/stream`;
    const streamTimeoutMs = this.getLangchainTimeoutMs();

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.status(200);
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'start', conversationId })}\n\n`);

    let fullAnswer = '';
    let fullReasoning = '';
    let buffer = '';
    let upstreamFailed = false;
    let upstreamErrorMsg = '';
    let assistantSaved = false;

    try {
      const upstream = await axios.post(
        url,
        {
          conversationId,
          prompt: enrichedPrompt,
          deepThinking,
          replyStyle: params.replyStyle,
          modelId,
          images,
          userId: user.userId,
          messages: this.mapHistoryMessages(priorHistory),
        },
        {
          timeout: streamTimeoutMs,
          responseType: 'stream',
          headers: this.getLangchainHeaders(),
        },
      );

      await new Promise<void>((resolve, reject) => {
        upstream.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const parts = buffer.split(/\r?\n/);
          buffer = parts.pop() ?? '';

          for (const rawLine of parts) {
            const line = rawLine.trim();
            if (!line) continue;
            const dataStr = line.startsWith('data:') ? line.slice(5).trim() : line;
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const json = JSON.parse(dataStr);
              const eventType = json?.type;
              if (eventType === 'start') continue;
              if (eventType === 'error') {
                upstreamFailed = true;
                upstreamErrorMsg = json?.message || 'AI 流式请求失败';
                res.write(`data: ${JSON.stringify({ type: 'error', message: upstreamErrorMsg })}\n\n`);
                continue;
              }
              if (eventType === 'done') {
                continue;
              }
              const reasoningDelta: string =
                json?.delta?.reasoning_content ??
                json?.reasoning ??
                json?.reasoning_content ??
                '';
              const contentDelta: string =
                json?.delta ??
                json?.content ??
                '';

              if (reasoningDelta) {
                fullReasoning += reasoningDelta;
                res.write(`data: ${JSON.stringify({ type: 'reasoning', delta: reasoningDelta })}\n\n`);
              }
              if (!contentDelta) continue;
              fullAnswer += contentDelta;
              res.write(`data: ${JSON.stringify({ type: 'delta', delta: contentDelta })}\n\n`);
            } catch {
              // ignore malformed upstream chunk
            }
          }
        });

        upstream.data.on('end', () => resolve());
        upstream.data.on('error', (err: Error) => reject(err));
      });

      if (!fullAnswer.trim() && buffer.trim()) {
        try {
          const fallback = JSON.parse(buffer.trim());
          const fallbackText: string =
            fallback?.delta ??
            fallback?.content ??
            '';
          if (fallbackText) {
            fullAnswer = fallbackText;
            res.write(`data: ${JSON.stringify({ type: 'delta', delta: fallbackText })}\n\n`);
          }
        } catch {
          // ignore fallback parse failure
        }
      }

      if (upstreamFailed && !fullAnswer.trim()) {
        await this.rollbackFailedTurn(user, conversationId, userMessage.id, isNewConversation);
        throw new BadRequestException(upstreamErrorMsg || 'AI 流式请求失败');
      }

      if (!fullAnswer.trim()) {
        await this.rollbackFailedTurn(user, conversationId, userMessage.id, isNewConversation);
        throw new BadRequestException('AI 返回内容为空或流格式不兼容');
      }

      await this.convService.addMessageForUser({
        userId: user.userId,
        conversationId,
        role: 'assistant',
        content: fullAnswer,
        reasoning: fullReasoning || undefined,
      });
      assistantSaved = true;

      res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
      res.end();
    } catch (e: any) {
      if (fullAnswer.trim() && !assistantSaved) {
        try {
          await this.convService.addMessageForUser({
            userId: user.userId,
            conversationId,
            role: 'assistant',
            content: fullAnswer,
            reasoning: fullReasoning || undefined,
          });
          assistantSaved = true;
        } catch {
          // ignore persistence error in fallback path
        }
      } else if (!fullAnswer.trim()) {
        await this.rollbackFailedTurn(user, conversationId, userMessage.id, isNewConversation);
      }

      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        'AI 流式请求失败';
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      res.end();
    }
  }
}

