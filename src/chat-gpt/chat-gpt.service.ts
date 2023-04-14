import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmpty } from 'lodash';
import { DateTime } from 'luxon';
import { I18nService } from 'nestjs-i18n';
import { ChatCompletionRequestMessage } from 'openai';
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
import { ChatGPTProvider } from './chat-gpt.provider';

type TextGenerationInput = {
  messages: (Message & { user: User })[];
  character?: Chat;
  mode: 'answer' | 'interrupt' | 'wakeup';
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
     *  1) text-davinchi vs chat-gpt3.5-turbo
     *  2) completion vs chat vs fine-tune
     *
     * temperature = , top-p = , best of =
     *            | text-davinci-003 | gpt-3.5-turbo
     * completion |                  |
     * chat       |                  |
     * fine-tune  |                  |
     */

    // TODO replace this shitty stuff
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME')!;
    input.messages.forEach((e) => {
      if (e.text) {
        e.text = e.text.replace(`@${botUsername}`, '');
      } else if (e.caption) {
        e.caption = e.caption.replace(`@${botUsername}`, '');
      }
    });

    const isFormal: boolean = Boolean(
      !input.character || !input.character.botDescriprion,
    );
    const hasQuotes: boolean = Boolean(
      input.character?.botQuotes && !isEmpty(input.character.botQuotes),
    );
    const botName = isFormal
      ? this.i18n.t('events.aiFormalName')
      : this.config.get<string>('TELEGRAM_BOT_NAME')!;
    const messages: Required<ChatCompletionRequestMessage>[] = input.messages
      .map(
        (m) =>
          ({
            role: m.isMainBotMessage ? 'assistant' : 'user',
            name: m.isMainBotMessage ? botName : this.getUserName(m.user),
            content: (m.text ?? m.caption)?.slice(0, MESSAGE_LENGTH_LIMIT),
          } as Partial<ChatCompletionRequestMessage>),
      )
      .filter((e): e is Required<ChatCompletionRequestMessage> =>
        Boolean(e.content),
      );
    let completionRequest: string | undefined;
    let chatRequest: ChatCompletionRequestMessage[] | undefined;

    const now = DateTime.local().toJSDate();
    let type: ChatGPTRequestType;
    let response: any;
    let error: any;

    try {
      if (isFormal && input.mode !== 'wakeup') {
        type = ChatGPTRequestType.Chat;
        chatRequest = messages;
        response = await this.provider.getChat(chatRequest);
      } else {
        type = ChatGPTRequestType.Completion;
        const description = this.getDescription({
          input,
          isFormal,
          hasQuotes,
        });
        const rudeRequirements = this.getRudeRequirements({
          isFormal,
          isRude: input.character?.botIsRude,
        });

        switch (input.mode) {
          case 'answer':
          case 'interrupt':
            // TODO change for male female
            completionRequest = `${description}${messages
              .map((m) => `${m.name}: ${m.content}`)
              .join('\n')}\n${botName} ${rudeRequirements}:`;
            break;
          case 'wakeup':
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

            completionRequest = this.i18n.t(`events.wakeup.${req}`, {
              args: {
                description,
                formal: !isFormal
                  ? this.i18n.t('events.wakeup.informalRef')
                  : '',
                rude: rudeRequirements,
                userDescription: userDescription,
              },
            }) as string;

            break;
          default:
            throw new Error(`There is no mode = ${input.mode}`);
        }

        response = await this.provider.getCompletion(completionRequest);
      }
    } catch (e) {
      handleError(e);
      error = e;
    }

    await this.requestRepo.create({
      chatRequest,
      completionRequest,
      response,
      date: now,
      type: type!,
      error,
    });

    return type! === ChatGPTRequestType.Chat
      ? response?.choices?.[0]?.message?.content
      : type! === ChatGPTRequestType.Completion
      ? response.choices?.[0]?.text
      : undefined;
  }

  private getDescription({
    isFormal,
    hasQuotes,
    input,
  }: {
    input: TextGenerationInput;
    isFormal: boolean;
    hasQuotes: boolean;
  }): string {
    return !isFormal
      ? `${this.config.get<string>('TELEGRAM_BOT_NAME')} - ${
          input.character!.botDescriprion
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
    return this.getRealUserName(user) ?? this.getDefualtUserName(user);
  }

  private getRealUserName(user: User): string | undefined {
    return user.firstName && user.lastName
      ? `${user.lastName} ${user.firstName}`
      : user.username ?? user.firstName ?? user.lastName;
  }

  private getDefualtUserName(user: User): string {
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
}
