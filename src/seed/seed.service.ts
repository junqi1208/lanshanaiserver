import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    const username = this.config.get<string>('SEED_ADMIN_USERNAME');
    const password = this.config.get<string>('SEED_ADMIN_PASSWORD');
    if (!username || !password) return;

    try {
      const existing = await this.usersService.findByUsername(username);
      if (existing) return;

      await this.usersService.createUser({ username, password, role: 'admin' });
      this.logger.log(`已初始化管理员用户：${username}`);
    } catch (e: any) {
      const code = e?.code || e?.driverError?.code;
      if (code === 'SQLITE_CONSTRAINT') return;
      this.logger.warn(`初始化管理员失败：${e?.message || String(e)}`);
    }
  }
}

