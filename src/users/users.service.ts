import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async createUser(params: {
    username: string;
    password: string;
    role?: 'user' | 'admin';
  }): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: { username: params.username },
    });
    if (existing) throw new ConflictException('用户名已存在');

    const passwordHash = await bcrypt.hash(params.password, 10);
    const user = this.usersRepo.create({
      username: params.username,
      nickname: params.username,
      gender: 'unknown',
      avatar: undefined,
      passwordHash,
      role: params.role ?? 'user',
    });
    return await this.usersRepo.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.usersRepo.findOne({ where: { username } });
  }

  async list(): Promise<Array<Pick<User, 'id' | 'username' | 'nickname' | 'gender' | 'avatar' | 'role' | 'createdAt'>>> {
    const users = await this.usersRepo.find({
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      gender: u.gender,
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
    }));
  }

  async update(
    id: string,
    patch: {
      password?: string;
      role?: 'user' | 'admin';
      nickname?: string;
      gender?: 'male' | 'female' | 'unknown';
      avatar?: string;
    },
  ): Promise<User> {
    const user = await this.findById(id);
    if (patch.password) {
      user.passwordHash = await bcrypt.hash(patch.password, 10);
    }
    if (patch.role) user.role = patch.role;
    if (patch.nickname !== undefined) user.nickname = patch.nickname;
    if (patch.gender) user.gender = patch.gender;
    if (patch.avatar !== undefined) user.avatar = patch.avatar || undefined;
    return await this.usersRepo.save(user);
  }

  async updateMe(
    userId: string,
    patch: { nickname?: string; gender?: 'male' | 'female' | 'unknown'; avatar?: string },
  ): Promise<User> {
    const user = await this.findById(userId);
    if (patch.nickname !== undefined) user.nickname = patch.nickname.trim();
    if (patch.gender) user.gender = patch.gender;
    if (patch.avatar !== undefined) user.avatar = patch.avatar || undefined;
    return await this.usersRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.usersRepo.remove(user);
  }
}

