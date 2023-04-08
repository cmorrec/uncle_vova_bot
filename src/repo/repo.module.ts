import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatRepo } from './chat.repo';
import { MessageRepo } from './message.repo';
import { RequestRepo } from './request.repo';
import { Chat, ChatSchema } from './schemas/chat.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { Request, RequestSchema } from './schemas/request.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UserRepo } from './user.repo';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      {
        name: Chat.name,
        schema: ChatSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: Request.name,
        schema: RequestSchema,
      },
      {
        name: Message.name,
        schema: MessageSchema,
      },
    ]),
  ],
  providers: [ChatRepo, MessageRepo, UserRepo, RequestRepo],
  exports: [ChatRepo, MessageRepo, UserRepo, RequestRepo],
})
export class RepoModule {}
