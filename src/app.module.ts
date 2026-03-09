import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './users/entities/user.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './conversations/entities/message.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AiModule } from './ai/ai.module';
import { SeedService } from './seed/seed.service';
import { Share } from './shares/entities/share.entity';
import { SharesModule } from './shares/shares.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFilePath = nodeEnv === 'production' ? '.env.production' : '.env.development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = (config.get<string>('DB_TYPE') ?? 'mysql').toLowerCase();
        const synchronize = (config.get<string>('DB_SYNCHRONIZE') ?? 'true') === 'true';

        if (dbType === 'sqlite') {
          return {
            type: 'sqlite' as const,
            database: config.get<string>('DB_SQLITE_PATH') ?? 'dev.sqlite',
            entities: [User, Conversation, Message, Share],
            synchronize,
          };
        }

        return {
          type: 'mysql' as const,
          host: config.get<string>('DB_HOST') ?? '127.0.0.1',
          port: Number(config.get<string>('DB_PORT') ?? '3306'),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_DATABASE'),
          charset: 'utf8mb4',
          entities: [User, Conversation, Message, Share],
          synchronize,
        };
      },
    }),
    UsersModule,
    AuthModule,
    ConversationsModule,
    AiModule,
    SharesModule,
  ],
  controllers: [AppController],
  providers: [AppService, SeedService],
})
export class AppModule {}
