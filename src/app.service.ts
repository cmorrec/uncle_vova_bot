import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { chain, Dictionary, isEmpty, keyBy, takeRight } from 'lodash';
import { DateTime } from 'luxon';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { Scenes, Telegraf } from 'telegraf';
import { ChatGPTService } from './chat-gpt/chat-gpt.service';

import { EnvironmentVariables } from './env-validator';
import { I18nTranslations } from './generated/i18n.generated';
import {
  BotContext,
  From,
  Message as ContextMessage,
} from './interfaces/context.interface';
import { Chat, Message, ChatRepo, MessageRepo, UserRepo, User } from './repo';
import { contextMessageToDb, contextUserToDb } from './utils/context-to-db';
import { getDateTime } from './utils/get-date-time';
import { handleError } from './utils/handle-error';
import { availableTextTypes } from './utils/message-types';

type UpdateDBInfo = {
  message: Message;
  repliedMessage: Message | null;
  chat: Chat;
};

type ResultType = { answer: string; isFormal: boolean };

const DEFAULT_MINUS_MINUTES = 20;
export const MESSAGES_LIMIT = 3;
const EVERY_NTH_MESSAGE = 15;
const MIN_MESSAGE_LENGTH = 20;

@Injectable()
export class AppService {
  private username: string;
  private INFORMAL_MENTIONS: readonly string[];
  private FORMAL_MENTIONS: readonly string[];

  constructor(
    @InjectBot() private bot: Telegraf<Scenes.SceneContext>,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly config: ConfigService<EnvironmentVariables>,
    private readonly chatGPT: ChatGPTService,
    private readonly chatRepo: ChatRepo,
    private readonly userRepo: UserRepo,
    private readonly messageRepo: MessageRepo,
  ) {
    this.username = this.config.get<string>('TELEGRAM_BOT_USERNAME')!;
    this.FORMAL_MENTIONS = [`@${this.username}`, 'Темин бот', 'бот Темы'];
    this.INFORMAL_MENTIONS = [
      'Дядя Вов',
      'Дядь Вов',
      'Тятя Вов',
      'Тять Вов',
      'ДядяВов',
      'ДядьВов',
      'ТятяВов',
      'ТятьВов',
    ];
  }

  @Cron('0 0 17 * * *')
  async wakeUpChat() {
    const initDate = DateTime.local().minus({ days: 3 }).toJSDate();
    const chats = await this.chatRepo.getWakedUp();

    const messageDict: Dictionary<Message> = (await Promise.all(
      chats.map(async (c) => this.messageRepo.getLastMessage(c.chatId)),
    ).then((res) => keyBy(res, (m) => m?.chatId))) as any;

    const sleepingChats = chats.filter(
      (c) => messageDict[c.chatId] && messageDict[c.chatId].date < initDate,
    );

    for (const chat of sleepingChats) {
      const answer = await this.chatGPT.get({
        messages: [],
        character: chat,
        mode: 'wakeup',
      });

      if (answer) {
        const newMessage = await this.bot.telegram.sendMessage(
          Number(chat.chatId),
          answer,
        );
        await this.saveReplyMessage({
          needSave: true,
          newMessage: newMessage as any,
          isFormal: false,
        });
      }
    }
  }

  async getStartMessage(): Promise<string> {
    // TODO
    return '/start';
  }

  async getHelpMessage(): Promise<string> {
    // TODO
    return '/help';
  }

  async getAnswer(updateDBInfo: UpdateDBInfo): Promise<ResultType | undefined> {
    const { message } = updateDBInfo;
    const text = message?.text ?? message?.caption;
    if (!message || !text || !availableTextTypes.includes(message.type)) {
      return undefined;
    }

    let result: ResultType | undefined = undefined;

    if (this.isRepliedBotMessage(updateDBInfo)) {
      result = await this.getAnswerOnReply(updateDBInfo);
    } else if (this.hasMention(text)) {
      result = await this.getAnswerOnMention(updateDBInfo);
    } else {
      result = await this.getDefaultAnswer(updateDBInfo);
    }

    return result;
  }

  private async getAnswerOnReply({
    chat,
    message,
    repliedMessage,
  }: Required<UpdateDBInfo>): Promise<ResultType | undefined> {
    const firstMessage =
      (await this.messageRepo.getByChatAndId({
        messageId: message.messageThreadId,
        chatId: chat.chatId,
      })) ??
      repliedMessage ??
      message;
    if (!firstMessage) {
      return undefined;
    }

    const messages = await this.getMessagesForChatGPTRequest({
      chatId: chat.chatId,
      date: firstMessage.date,
      // TODO can't reply on old messages, fix it
      limit: MESSAGES_LIMIT * 2,
    });
    const isInformal = this.isInformalChatGPTRequest(messages, chat);
    const answer = await this.chatGPT.get({
      messages: messages,
      mode: 'answer',
      character: isInformal ? chat : undefined,
    });

    return answer ? { answer, isFormal: !isInformal } : undefined;
  }

  private async getAnswerOnMention({
    chat,
    message,
  }: UpdateDBInfo): Promise<ResultType | undefined> {
    const messages = await this.getMessagesForChatGPTRequest({
      chatId: chat.chatId,
      date: message.date,
    });
    const isInformal =
      this.hasInformalMention((message.text ?? message.caption)!) ||
      (this.isInformalChatGPTRequest(messages, chat) &&
        !this.hasFormalMention((message.text ?? message.caption)!));
    const answer = await this.chatGPT.get({
      messages: messages,
      mode: 'answer',
      character: isInformal ? chat : undefined,
    });

    return answer ? { answer, isFormal: !isInformal } : undefined;
  }

  private async getDefaultAnswer({
    chat,
  }: UpdateDBInfo): Promise<ResultType | undefined> {
    const lastMessage =
      (await this.messageRepo.getLastBotMessage(chat.chatId)) ??
      (await this.messageRepo.getLastMessage(chat.chatId))!;

    const messages = await this.getMessagesForChatGPTRequest({
      chatId: chat.chatId,
      date: lastMessage.date,
      minusMinutes: 0,
      // if less than a half big messages, maybe don't need to interrupt
      limit: EVERY_NTH_MESSAGE * 2,
    });

    if (
      messages.filter(
        (e) =>
          (e.text?.length ?? 0) > MIN_MESSAGE_LENGTH ||
          (e.caption?.length ?? 0) > MIN_MESSAGE_LENGTH,
      ).length < EVERY_NTH_MESSAGE
    ) {
      return undefined;
    }

    const answer = await this.chatGPT.get({
      messages: takeRight(messages, MESSAGES_LIMIT),
      mode: 'interrupt',
      character: chat,
    });

    return answer ? { answer, isFormal: false } : undefined;
  }

  private hasMention(text: string): boolean {
    return this.getAllMentions().some((e) =>
      text.toLowerCase().includes(e.toLowerCase()),
    );
  }

  private hasInformalMention(text: string): boolean {
    return this.getInformalMentions().some((e) =>
      text.toLowerCase().includes(e.toLowerCase()),
    );
  }

  private hasFormalMention(text: string): boolean {
    return this.getFormalMentions().some((e) =>
      text.toLowerCase().includes(e.toLowerCase()),
    );
  }

  private isRepliedBotMessage(
    updateDBInfo: UpdateDBInfo,
  ): updateDBInfo is Required<UpdateDBInfo> {
    return (
      updateDBInfo.repliedMessage !== null &&
      updateDBInfo.repliedMessage.from.username === this.username
    );
  }

  private async getMessagesForChatGPTRequest({
    chatId,
    date,
    minusMinutes = DEFAULT_MINUS_MINUTES,
    limit = MESSAGES_LIMIT,
  }: {
    chatId: string;
    date: Date;
    minusMinutes?: number;
    limit?: number;
  }): Promise<(Message & { user: User })[]> {
    const initDate = getDateTime(date)!
      .minus({ minutes: minusMinutes })
      .toJSDate();

    const messages = await this.messageRepo.getLastMessages({
      chatId: chatId,
      date: initDate,
      limit: limit,
      types: availableTextTypes,
    });

    // TODO change for join
    const userIds = chain(messages)
      .map((e) => e.userId)
      .uniq()
      .value();
    const users = await this.userRepo.getByIds(userIds);

    return messages.map((m) => ({
      ...m,
      user: users.find((u) => u.userId === m.userId)!,
    }));
  }

  private isInformalChatGPTRequest(messages: Message[], chat: Chat): boolean {
    // nothing -> character, formal -> undefined, informal -> character
    return (
      Boolean(
        chat.botDescriprion || (chat.botQuotes && !isEmpty(chat.botQuotes)),
      ) &&
      (messages.some(
        (e) => e.isMainBotMessage && e.isFormalMessage === false,
      ) ||
        messages.every((e) => !e.isMainBotMessage))
    );
  }

  private getAllMentions() {
    return this.getFormalMentions().concat(this.getInformalMentions());
  }

  private getFormalMentions() {
    return this.FORMAL_MENTIONS;
  }

  private getInformalMentions() {
    return this.INFORMAL_MENTIONS;
  }

  // TODO move it to main middleware if for all users used
  async saveChatMiddleware(ctx: BotContext): Promise<Chat | undefined> {
    const now = DateTime.local().toJSDate();
    const ctxMessage = ctx.update.message;
    const ctxChat = ctxMessage.chat;
    const ctxFrom = ctxMessage.from;

    const chatId = String(ctxChat.id);
    const userId = String(ctxFrom.id);
    let chat = await this.chatRepo.getById(chatId);

    if (!chat) {
      // TODO delete if for all users used
      const ownerIds = this.config.get<string>('OWNER_IDS');
      if (
        ctxMessage.text === '/start' &&
        (!ownerIds || ownerIds.split(',').includes(userId))
      ) {
        chat = {
          chatId: chatId,
          chatMemberIds: [userId],
          botDescriprion: undefined,
          botQuotes: [],
          title: ctxChat.title,
          createdAt: now,
          updatedAt: now,
          type: ctxChat.type,
          wakeUp: true,
          botIsRude: true,
        };
        await this.chatRepo.create(chat);
        await this.upsertUsers(now, [ctxFrom]);
      } else {
        return;
      }
    }

    return chat;
  }

  async saveMessageMiddleware(
    ctx: BotContext,
  ): Promise<UpdateDBInfo | undefined> {
    try {
      console.info(JSON.stringify(ctx.update, null, 3), '\n');
      const now = DateTime.local().toJSDate();
      const ctxMessage = ctx.update.message;
      const ctxRepliedMessage = ctxMessage.reply_to_message;
      const ctxChat = ctxMessage.chat;
      const ctxFrom = ctxMessage.from;

      const chatId = String(ctxChat.id);
      const userId = String(ctxFrom.id);

      let chat = await this.chatRepo.getById(chatId);
      if (!chat) {
        return undefined;
      }

      await this.upsertChatMembers(chat, [userId, ctxRepliedMessage?.from.id]);
      await this.upsertUsers(now, [ctxFrom, ctxRepliedMessage?.from]);

      let repliedMessage: Message | null = null;
      try {
        if (ctxRepliedMessage) {
          repliedMessage = await this.messageRepo.getByChatAndId({
            chatId: chat?.chatId,
            messageId: ctxRepliedMessage?.message_id.toString(),
          });
          if (!repliedMessage) {
            repliedMessage = contextMessageToDb({
              message: ctxRepliedMessage,
              now,
              isMainBot: false,
            });
            await this.messageRepo.create(repliedMessage);
          }
        }
      } catch (e) {
        handleError(e);
      }

      const newMessage = contextMessageToDb({
        message: ctxMessage,
        now,
        isMainBot: false,
      });
      await this.messageRepo.create(newMessage);

      return {
        chat,
        message: newMessage,
        repliedMessage: repliedMessage,
      };
    } catch (error) {
      handleError(error);

      return undefined;
    }
  }

  private async upsertUsers(now: Date, ctxFroms: (From | undefined)[]) {
    await Promise.all(
      chain(ctxFroms)
        .filter((e): e is From => Boolean(e))
        .uniqBy((e) => e.id.toString())
        .map(async (ctxFrom) => {
          const userId = ctxFrom.id.toString();

          const user = await this.userRepo.getById(userId);
          if (!user) {
            await this.userRepo.create(contextUserToDb(ctxFrom, now));
          } else if (
            user.firstName !== ctxFrom.first_name ||
            user.lastName !== ctxFrom.last_name ||
            user.username !== ctxFrom.username
          ) {
            user.firstName = ctxFrom.first_name;
            user.lastName = ctxFrom.last_name;
            user.username = ctxFrom.username;
            user.updatedAt = now;

            await this.userRepo.update(user);
          }
        })
        .value(),
    );
  }

  private async upsertChatMembers(
    chat: Chat,
    userIds: (string | number | undefined)[],
  ) {
    const newUserIds = chain(userIds)
      .map((e) => e?.toString())
      .filter((e): e is string => Boolean(e))
      .uniq()
      .filter((e) => !chat.chatMemberIds.includes(e))
      .value();

    if (!isEmpty(newUserIds)) {
      chat.chatMemberIds = newUserIds.concat(chat.chatMemberIds);
      chat.updatedAt = DateTime.local().toJSDate();

      await this.chatRepo.update(chat);
    }
  }

  public async saveReplyMessage({
    newMessage,
    needSave,
    isFormal,
  }: {
    newMessage: ContextMessage;
    isFormal?: boolean;
    needSave: boolean;
  }) {
    const bot = newMessage.from;
    const botId = bot?.id.toString();
    const now = DateTime.local().toJSDate();
    const chat = (await this.chatRepo.getById(newMessage.chat.id.toString()))!;
    const botUser = await this.userRepo.getById(botId);

    await Promise.all([
      needSave
        ? this.messageRepo.create(
            contextMessageToDb({
              message: newMessage,
              now,
              isMainBot: true,
              isFormal,
            }),
          )
        : undefined,
      botId && !chat.chatMemberIds.includes(botId)
        ? chat.chatMemberIds.push(botId)
        : undefined,
      bot && !botUser
        ? this.userRepo.create(contextUserToDb(bot, now))
        : undefined,
    ]);
  }
}
