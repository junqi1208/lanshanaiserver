import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/types/request-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: JwtUser) {
    const u = await this.usersService.findById(user.userId);
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: JwtUser, @Body() dto: UpdateMeDto) {
    const u = await this.usersService.updateMe(user.userId, dto);
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async list() {
    return await this.usersService.list();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async get(@Param('id') id: string) {
    const u = await this.usersService.findById(id);
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateUserDto) {
    const u = await this.usersService.createUser(dto);
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
    };
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const u = await this.usersService.update(id, dto);
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { ok: true };
  }
}

