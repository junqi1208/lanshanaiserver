import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Response } from 'express';
import { ConversationsService } from '../conversations/conversations.service';
import type { JwtUser } from '../common/types/request-user.type';

type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly convService: ConversationsService,
  ) {}

  private getBrandIdentityReply(prompt: string): string | undefined {
    const text = (prompt || '').toLowerCase();
    const asksIdentity =
      /你是谁|是哪家|哪个公司|哪家公司的api|你是.*api|谁家的api/.test(prompt) ||
      /who are you|which company|whose api|deepseek|openai/.test(text);
    if (!asksIdentity) return undefined;
    return '我是览山AI助手。';
  }

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

  async ask(user: JwtUser, params: { conversationId?: string; prompt: string; deepThinking?: boolean }) {
    const conversationId =
      params.conversationId ??
      (await this.convService.createForUser({
        userId: user.userId,
        title: params.prompt.slice(0, 30),
      })).id;

    await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId,
      role: 'user',
      content: params.prompt,
    });

    const brandReply = this.getBrandIdentityReply(params.prompt);
    if (brandReply) {
      await this.convService.addMessageForUser({
        userId: user.userId,
        conversationId,
        role: 'assistant',
        content: brandReply,
      });
      return { conversationId, answer: brandReply };
    }

    const history = await this.convService.listMessagesForUser(user.userId, conversationId);
    const systemPrompt =
      this.config.get<string>('AI_SYSTEM_PROMPT') ??
      '你是一个严谨、简洁的 AI 助手。';

    const baseUrl =
      this.config.get<string>('OPENAI_BASE_URL') ??
      this.config.get<string>('DEEPSEEK_BASE_URL') ??
      'https://api.openai.com';
    const model = this.resolveModel(baseUrl, params.deepThinking);
    const openaiApiKey =
      this.config.get<string>('OPENAI_API_KEY') ?? this.config.get<string>('AI_API_KEY');
    const deepseekApiKey =
      this.config.get<string>('DEEPSEEK_API_KEY') ?? this.config.get<string>('AI_API_KEY');

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

    const base = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    const url = `${base}/v1/chat/completions`;
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const temperature = Number(this.config.get<string>('OPENAI_TEMPERATURE') ?? '0.7');
    const timeoutMs = Number(this.config.get<string>('OPENAI_TIMEOUT_MS') ?? '60000');

    const postOnce = async (params: { url: string; model: string }) => {
      return await axios.post(
        params.url,
        {
          model: params.model,
          messages,
          temperature,
        },
        {
          headers: {
            Authorization: `Bearer ${getApiKeyForUpstream(params.url)}`,
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        },
      );
    };

    let resp;
    try {
      resp = await postOnce({ url, model });
    } catch (e: any) {
      const isTimeout =
        (axios.isAxiosError(e) && e.code === 'ECONNABORTED') ||
        String(e?.message || '').toLowerCase().includes('timeout');

      const canFallback =
        isTimeout &&
        base.includes('api.openai.com') &&
        !this.config.get<string>('OPENAI_BASE_URL');

      if (!canFallback) {
        const msg =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          (isTimeout ? 'AI 请求超时' : 'AI 请求失败');
        throw new BadRequestException(msg);
      }

      const fallbackBase =
        this.config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com';
      const fallbackUrl = `${fallbackBase.replace(/\/$/, '').replace(/\/v1$/, '')}/v1/chat/completions`;
      const fallbackModel =
        params.deepThinking
          ? (this.config.get<string>('DEEPSEEK_REASONER_MODEL') ?? 'deepseek-reasoner')
          : (this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat');
      resp = await postOnce({ url: fallbackUrl, model: fallbackModel });
    }

    const answer: string | undefined = resp.data?.choices?.[0]?.message?.content;
    const reasoning: string | undefined = resp.data?.choices?.[0]?.message?.reasoning_content;
    if (!answer) throw new BadRequestException('AI 返回内容为空');

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
    params: { conversationId?: string; prompt: string; deepThinking?: boolean },
    res: Response,
  ) {
    const conversationId =
      params.conversationId ??
      (await this.convService.createForUser({
        userId: user.userId,
        title: params.prompt.slice(0, 30),
      })).id;

    await this.convService.addMessageForUser({
      userId: user.userId,
      conversationId,
      role: 'user',
      content: params.prompt,
    });

    const brandReply = this.getBrandIdentityReply(params.prompt);
    if (brandReply) {
      await this.convService.addMessageForUser({
        userId: user.userId,
        conversationId,
        role: 'assistant',
        content: brandReply,
      });
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.status(200);
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ type: 'start', conversationId })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'delta', delta: brandReply })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
      res.end();
      return;
    }

    const history = await this.convService.listMessagesForUser(user.userId, conversationId);
    const systemPrompt =
      this.config.get<string>('AI_SYSTEM_PROMPT') ??
      '你是一个严谨、简洁的 AI 助手。';
    const baseUrl =
      this.config.get<string>('OPENAI_BASE_URL') ??
      this.config.get<string>('DEEPSEEK_BASE_URL') ??
      'https://api.openai.com';
    const model = this.resolveModel(baseUrl, params.deepThinking);
    const openaiApiKey =
      this.config.get<string>('OPENAI_API_KEY') ?? this.config.get<string>('AI_API_KEY');
    const deepseekApiKey =
      this.config.get<string>('DEEPSEEK_API_KEY') ?? this.config.get<string>('AI_API_KEY');

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

    const base = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    const url = `${base}/v1/chat/completions`;
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];
    const temperature = Number(this.config.get<string>('OPENAI_TEMPERATURE') ?? '0.7');
    const streamTimeoutMs = Number(
      this.config.get<string>('OPENAI_STREAM_TIMEOUT_MS') ?? '180000',
    );

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.status(200);
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'start', conversationId })}\n\n`);

    let fullAnswer = '';
    let fullReasoning = '';
    let buffer = '';

    try {
      const postStreamOnce = async (params: { url: string; model: string }) => {
        return await axios.post(
          params.url,
          {
            model: params.model,
            messages,
            temperature,
            stream: true,
          },
          {
            headers: {
              Authorization: `Bearer ${getApiKeyForUpstream(params.url)}`,
              'Content-Type': 'application/json',
            },
            timeout: streamTimeoutMs,
            responseType: 'stream',
          },
        );
      };

      let upstream;
      try {
        upstream = await postStreamOnce({ url, model });
      } catch (e: any) {
        const isTimeout =
          (axios.isAxiosError(e) && e.code === 'ECONNABORTED') ||
          String(e?.message || '').toLowerCase().includes('timeout');

        const canFallback =
          isTimeout &&
          base.includes('api.openai.com') &&
          !this.config.get<string>('OPENAI_BASE_URL');

        if (!canFallback) {
          throw e;
        }

        const fallbackBase =
          this.config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com';
        const fallbackUrl = `${fallbackBase.replace(/\/$/, '').replace(/\/v1$/, '')}/v1/chat/completions`;
        const fallbackModel =
          params.deepThinking
            ? (this.config.get<string>('DEEPSEEK_REASONER_MODEL') ?? 'deepseek-reasoner')
            : (this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat');

        upstream = await postStreamOnce({ url: fallbackUrl, model: fallbackModel });
      }

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
              const reasoningDelta: string =
                json?.choices?.[0]?.delta?.reasoning_content ??
                json?.choices?.[0]?.message?.reasoning_content ??
                '';
              const contentDelta: string =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
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
            fallback?.choices?.[0]?.message?.content ??
            fallback?.choices?.[0]?.delta?.content ??
            '';
          if (fallbackText) {
            fullAnswer = fallbackText;
            res.write(`data: ${JSON.stringify({ type: 'delta', delta: fallbackText })}\n\n`);
          }
        } catch {
          // ignore fallback parse failure
        }
      }

      if (!fullAnswer.trim()) {
        throw new BadRequestException('AI 返回内容为空或流格式不兼容');
      }

      await this.convService.addMessageForUser({
        userId: user.userId,
        conversationId,
        role: 'assistant',
        content: fullAnswer,
        reasoning: fullReasoning || undefined,
      });

      res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
      res.end();
    } catch (e: any) {
      // 如果流式过程中已产生部分回答（例如用户点击暂停），也要落库保存到历史会话
      if (fullAnswer.trim()) {
        try {
          await this.convService.addMessageForUser({
            userId: user.userId,
            conversationId,
            role: 'assistant',
            content: fullAnswer,
            reasoning: fullReasoning || undefined,
          });
        } catch {
          // ignore persistence error in fallback path
        }
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

