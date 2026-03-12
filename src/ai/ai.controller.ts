import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/types/request-user.type';
import { AskDto } from './dto/ask.dto';
import { SummarizeTitleDto } from './dto/summarize-title.dto';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ask')
  @HttpCode(200)
  async ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return await this.aiService.ask(user, dto);
  }

  @Post('ask/stream')
  @HttpCode(200)
  async askStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: AskDto,
    @Res() res: Response,
  ) {
    await this.aiService.askStream(user, dto, res);
  }

  @Post('summarize-title')
  @HttpCode(200)
  async summarizeTitle(@CurrentUser() user: JwtUser, @Body() dto: SummarizeTitleDto) {
    return await this.aiService.summarizeTitle(user, dto.conversationId);
  }
}

