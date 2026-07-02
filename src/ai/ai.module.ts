import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { FilesModule } from '../files/files.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [ConversationsModule, FilesModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}

