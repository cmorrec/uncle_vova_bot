import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './schemas/chat.schema';

@Injectable()
export class ChatRepo {
  constructor(@InjectModel(Chat.name) private chatModel: Model<ChatDocument>) {}

  async create(chat: Chat): Promise<Chat> {
    const newChat = new this.chatModel(chat);

    return newChat.save();
  }

  async update(chat: Chat) {
    return this.chatModel.findOneAndUpdate({ chatId: chat.chatId }, chat);
  }

  async getById(chatId: string): Promise<Chat | null> {
    return this.chatModel.findOne({ chatId }).lean();
  }

  async getWakedUp(): Promise<Chat[]> {
    return this.chatModel.find({ wakeUp: true }).lean();
  }
}
