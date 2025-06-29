import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmpty } from 'lodash';
import { DateTime } from 'luxon';
import { I18nService } from 'nestjs-i18n';
import { MESSAGES_LIMIT } from 'src/app.service';
import { EnvironmentVariables } from 'src/env-validator';
import { I18nTranslations } from 'src/generated/i18n.generated';
import {
  Chat,
  ChatGPTRequestType,
  Message,
  MessageRepo,
  RequestRepo,
  User,
  UserRepo,
} from 'src/repo';
import { handleError } from 'src/utils/handle-error';
import { availableTextTypes } from 'src/utils/message-types';
import {
  ChatCompletionRequestMessage,
  ChatGPTProvider,
} from './chat-gpt.provider';

type TextGenerationInput = {
  messages: (Message & { user: User })[];
  character?: Chat;
  mode: 'answer' | 'interrupt' | 'wakeup';
};
type MessageType = {
  name: string;
  role: 'assistant' | 'user';
  content: string;
};

const MESSAGE_LENGTH_LIMIT = 836;

@Injectable()
export class ChatGPTService {
  constructor(
    private readonly provider: ChatGPTProvider,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly userRepo: UserRepo,
    private readonly messageRepo: MessageRepo,
    private readonly requestRepo: RequestRepo,
    private readonly config: ConfigService<EnvironmentVariables>,
  ) {}

  async get(input: TextGenerationInput): Promise<string | undefined> {
    /**
     * Дядя Вова - вредный глупый старик-алкоголик, который много матерится.
     *
     * Options:
     *  1) text-davinchi vs chat-gpt3.5-turbo vs gpt-4o
     *  2) completion vs chat vs fine-tune
     *
     * temperature = , top-p = , best of =
     *            | text-davinci-003 | gpt-3.5-turbo | gpt-4o
     * completion |                  |               |
     * chat       |                  |               |
     * fine-tune  |                  |               |
     */

    const now = DateTime.local().toJSDate();

    // Users should be able to ignore character by calling him a special way
    const isFormal = this.isBotFormal(input);
    const botName = this.getBotName(isFormal);
    const description = this.getDescription({ input, isFormal });
    const userMessages = this.handleMessages(input.messages, isFormal);
    const assistantMessages: MessageType[] = isFormal
      ? []
      : [{ content: description, name: botName, role: 'assistant' }];
    const promptMessages = [...assistantMessages, ...userMessages];
    const type = this.getRequestType(input);

    try {
      const { chatRequest, completionRequest, response } =
        await this.requestChatGPT({
          type,
          messages: promptMessages,
          character: input.character,
          isFormal,
        });

      await this.requestRepo.create({
        chatRequest,
        completionRequest,
        response,
        date: now,
        type: type!,
      });

      return response?.text;
    } catch (e) {
      handleError(e);

      await this.requestRepo.create({
        chatRequest: promptMessages,
        date: now,
        type: type!,
        error: e,
      });
    }

    return undefined;
  }

  private async requestChatGPT(input: {
    type: ChatGPTRequestType;
    messages: MessageType[];
    isFormal: boolean;
    character: TextGenerationInput['character'];
  }) {
    if (input.type === ChatGPTRequestType.Chat) {
      const chatRequest = input.messages as ChatCompletionRequestMessage[];
      const response = await this.provider.getChat(chatRequest);

      return { chatRequest, response };
    }

    if (input.type === ChatGPTRequestType.Completion) {
      const description = this.getDescription({
        input,
        isFormal: input.isFormal,
      });
      const completionRequest = await this.getWakeupInput({
        character: input.character,
        description,
        isFormal: input.isFormal,
      });
      const response = await this.provider.getCompletion(completionRequest);

      return { completionRequest, response };
    }

    return {
      completionRequest: undefined,
      chatRequest: undefined,
      response: undefined,
    };
  }

  private async getWakeupInput(input: {
    character?: Chat;
    description: string;
    isFormal: boolean;
  }): Promise<string> {
    const rudeRequirements = this.getRudeRequirements({
      isFormal: input.isFormal,
      isRude: input.character?.botIsRude,
    });
    const option = this.randomInteger(0, 4);
    const userDescription = await this.getRandomUserDescription(
      input.character,
    );

    const req =
      option === 0 && userDescription
        ? 'questionForUser'
        : option === 1
        ? 'rememberJoke'
        : option === 2
        ? 'createFunFact'
        : option === 3
        ? 'questionForAll'
        : ('createJoke' as const);

    return this.i18n.t(`events.wakeup.${req}`, {
      args: {
        description: input.description,
        formal: !input.isFormal ? this.i18n.t('events.wakeup.informalRef') : '',
        rude: rudeRequirements,
        userDescription: userDescription,
      },
    });
  }

  private getDescription({
    isFormal,
    input,
  }: {
    input: Pick<TextGenerationInput, 'character'>;
    isFormal: boolean;
  }): string {
    const hasQuotes = this.hasBotQuotes(input);

    return !isFormal
      ? `${this.config.get<string>('TELEGRAM_BOT_NAME')} - ${
          input.character!.botDescription
        }.${
          hasQuotes
            ? ` ${this.i18n.t('events.hisQuotesTransition')}:\n\n${input
                .character!.botQuotes!.map((q) => `"${q}"`)
                .join('\n')}`
            : ''
        }\n\n`
      : '';
  }

  private getUserName(user: User): string {
    return this.getRealUserName(user) ?? this.getDefaultUserName(user);
  }

  private getRealUserName(user: User): string | undefined {
    return user.firstName && user.lastName
      ? `${user.lastName} ${user.firstName}`
      : user.username ?? user.firstName ?? user.lastName;
  }

  private getDefaultUserName(user: User): string {
    const lastDigits = Number(user.userId.slice(-1, 0));
    const defaultNames = this.i18n.t('events.defaultNames');

    return lastDigits % 3 === 0
      ? defaultNames[0]
      : lastDigits % 2 === 0
      ? defaultNames[1]
      : lastDigits % 5 === 0
      ? defaultNames[2]
      : defaultNames[3];
  }

  private randomInteger(min: number, max: number) {
    const rand = min + Math.random() * (max + 1 - min);

    return Math.floor(rand);
  }

  private getRudeRequirements({
    isFormal,
    isRude,
  }: {
    isFormal: boolean;
    isRude?: boolean;
  }) {
    return !isFormal && isRude
      ? `(${this.i18n.t('events.rudeRequirements')})`
      : '';
  }

  private async getRandomUserDescription(
    chat?: Chat,
  ): Promise<string | undefined> {
    if (!chat || !chat.chatMemberIds || isEmpty(chat.chatMemberIds)) {
      return undefined;
    }

    const users = await this.userRepo
      .getByIds(chat.chatMemberIds)
      .then((res) => res.filter((u) => !u.isBot));
    if (isEmpty(users)) {
      return undefined;
    }

    const randomUser = users[this.randomInteger(0, users.length)];
    if (!randomUser) {
      return undefined;
    }

    const username = this.getRealUserName(randomUser);
    if (!username) {
      return undefined;
    }

    const userMessages = await this.messageRepo.getLastMessages({
      chatId: chat.chatId,
      limit: MESSAGES_LIMIT,
      types: availableTextTypes,
      userId: randomUser.userId,
    });
    if (isEmpty(userMessages)) {
      return undefined;
    }

    const userDescription = `${username}. ${this.i18n.t(
      'events.wakeup.userQuotesTransition',
    )} ${username}:\n\n ${userMessages
      .map((m) => `"${m.text ?? m.caption}"`)
      .join('\n')}`;

    return userDescription;
  }

  private getRole(isMainBotMessage: boolean): 'assistant' | 'user' {
    return isMainBotMessage ? 'assistant' : 'user';
  }

  private handleMessages(
    messages: TextGenerationInput['messages'],
    isFormal: boolean,
  ): MessageType[] {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME')!;
    const botName = this.getBotName(isFormal);

    return messages
      .map((m) => {
        if (m.text) {
          m.text = m.text.replace(`@${botUsername}`, botName);
        } else if (m.caption) {
          m.caption = m.caption.replace(`@${botUsername}`, botName);
        }

        return m;
      })
      .map((m) => ({
        role: this.getRole(m.isMainBotMessage),
        name: m.isMainBotMessage ? botName : this.getUserName(m.user),
        content: (m.text ?? m.caption)?.slice(0, MESSAGE_LENGTH_LIMIT) ?? '',
      }))
      .filter((e) => Boolean(e.content));
  }

  private getBotName(isFormal: boolean) {
    return isFormal
      ? this.i18n.t('events.aiFormalName')
      : this.config.get<string>('TELEGRAM_BOT_NAME')!;
  }

  private isBotFormal(input: Pick<TextGenerationInput, 'character'>): boolean {
    return Boolean(!input.character || !input.character.botDescription);
  }

  private hasBotQuotes(input: Pick<TextGenerationInput, 'character'>): boolean {
    return Boolean(
      input.character?.botQuotes && !isEmpty(input.character.botQuotes),
    );
  }

  private getRequestType(
    input: Pick<TextGenerationInput, 'mode'>,
  ): ChatGPTRequestType {
    return input.mode === 'wakeup'
      ? ChatGPTRequestType.Completion
      : ChatGPTRequestType.Chat;
  }
}
