import { Module } from '@nestjs/common';
import { RepoModule } from 'src/repo/repo.module';
import { ChatGPTProvider } from './chat-gpt.provider';
import { ChatGPTService } from './chat-gpt.service';

@Module({
  imports: [RepoModule],
  providers: [ChatGPTProvider, ChatGPTService],
  exports: [ChatGPTService],
})
export class ChatGPTModule {}
