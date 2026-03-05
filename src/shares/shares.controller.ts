import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/types/request-user.type';
import { CreateShareDto } from './dto/create-share.dto';
import { SharesService } from './shares.service';

@Controller('shares')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() user: JwtUser, @Body() dto: CreateShareDto) {
    return await this.sharesService.createShare({
      userId: user.userId,
      conversationId: dto.conversationId,
      groupIds: dto.groupIds,
    });
  }

  @Get(':token')
  async detail(@Param('token') token: string) {
    return await this.sharesService.getShareByToken(token);
  }
}

