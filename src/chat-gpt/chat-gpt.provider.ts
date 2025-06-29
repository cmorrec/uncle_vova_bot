import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAITypes, { OpenAI, ClientOptions } from 'openai';
import { encode } from 'gpt-3-encoder';

import { EnvironmentVariables } from 'src/env-validator';
import { handleError } from 'src/utils/handle-error';
import { ChatGPTResponseToSave } from 'src/repo';

export type ChatCompletionRequestMessage = Pick<
  OpenAITypes.Chat.Completions.ChatCompletionMessage,
  'role' | 'content'
>;

const SMALL_MODEL = 'text-davinci-003';
const MEDIUM_MODEL = 'gpt-3.5-turbo';
const BIG_MODEL = 'gpt-4o';

const MODEL = BIG_MODEL;

const TEMPERATURE = 0.7;
const MAX_TOKENS = 1800;

@Injectable()
export class ChatGPTProvider {
  private openai: OpenAI;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const configuration: ClientOptions = {
      apiKey: this.config.get('OPENAI_API_KEY'),
    };
    this.openai = new OpenAI(configuration);
  }

  async getCompletion(
    requestText: string,
  ): Promise<ChatGPTResponseToSave | undefined> {
    try {
      const response = await this.openai.completions.create({
        model: SMALL_MODEL,
        prompt: requestText,
        temperature: TEMPERATURE,
        max_tokens: this.getMaxTokens({ prompt: requestText }),
      });

      return {
        text: response.choices[0].text,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      handleError(error);
    }

    return undefined;
  }

  async getChat(
    requestChat: ChatCompletionRequestMessage[],
  ): Promise<ChatGPTResponseToSave | undefined> {
    try {
      const response = await this.openai.chat.completions.create({
        model: MODEL,
        messages: requestChat.map((e) => ({
          role: e.role,
          content: e.content,
        })),
        temperature: TEMPERATURE,
        max_tokens: this.getMaxTokens({ messages: requestChat }),
      });

      return {
        text: response.choices[0].message.content ?? undefined,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      handleError(error);
    }

    return undefined;
  }

  async getFineTune(input: { trainingFile: string }) {
    // try {
    //   const response = await this.openai.createFineTune({
    //     model: "text-davinci-003",
    //     training_file: '',
    //     // max_tokens: 7,
    //   });

    //   return response;
    // } catch (error) {
    //   handleError(error);
    // }

    return undefined;
  }

  private getMaxTokens(
    input: { prompt: string } | { messages: ChatCompletionRequestMessage[] },
  ): number {
    const max = MAX_TOKENS;
    if ('prompt' in input) {
      const encodedCompletion = encode(input.prompt);

      return max - encodedCompletion.length;
    } else if ('messages' in input) {
      const encodedChatTokenNumber = input.messages
        .map((e) => encode(e.content ?? '').length)
        .reduce((acc, cur) => acc + cur);

      return max - encodedChatTokenNumber;
    } else {
      return 0;
    }
  }
}
