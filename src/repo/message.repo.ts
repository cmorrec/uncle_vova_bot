import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isEmpty } from 'lodash';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class MessageRepo {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async create(message: Message): Promise<Message> {
    const newMessage = new this.messageModel(message);

    return newMessage.save();
  }

  async getByChatAndId({
    chatId,
    messageId,
  }: {
    chatId: string;
    messageId?: string;
  }): Promise<Message | null> {
    return this.messageModel.findOne({ messageId, chatId }).lean();
  }

  async getLastBotMessage(chatId: string) {
    return this.getLastMessageByCondition({ chatId, isMainBotMessage: true });
  }

  async getLastMessage(chatId: string) {
    return this.getLastMessageByCondition({ chatId });
  }

  async getLastMessages({
    chatId,
    date,
    types,
    limit,
    userId,
  }: {
    chatId: string;
    date?: Date;
    types: string[];
    limit: number;
    userId?: string;
  }) {
    return this.messageModel
      .find({
        chatId,
        ...(date ? { date: { $gte: date } } : {}),
        messageType: { $in: types },
        ...(userId ? { userId } : {}),
      })
      .sort({ date: -1 })
      .limit(limit)
      .lean()
      .then((res) => res.sort((a, b) => (a.date > b.date ? 1 : -1)));
  }

  async getLastMessageByCondition(where: Partial<Message>) {
    return this.messageModel
      .find(where)
      .sort({ date: 1 })
      .limit(1)
      .lean()
      .then((res) => (isEmpty(res) ? null : res[0]));
  }
}
