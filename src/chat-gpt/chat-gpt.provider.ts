import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import { encode } from 'gpt-3-encoder';

import { EnvironmentVariables } from 'src/env-validator';
import { handleError } from 'src/utils/handle-error';

const TEMPERATURE = 1;
const MAX_TOKENS = 1800;

@Injectable()
export class ChatGPTProvider {
  private openai: OpenAIApi;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const configuration = new Configuration({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
    this.openai = new OpenAIApi(configuration);
  }

  async getCompletion(requestText: string) {
    try {
      const response = await this.openai.createCompletion({
        model: 'text-davinci-003',
        prompt: requestText,
        temperature: TEMPERATURE,
        max_tokens: this.getMaxTokens({ prompt: requestText }),
      });

      return response.data;
    } catch (error) {
      handleError(error);
    }

    return undefined;
  }

  async getChat(requestChat: ChatCompletionRequestMessage[]) {
    try {
      const response = await this.openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: requestChat,
        temperature: TEMPERATURE,
        max_tokens: this.getMaxTokens({ messages: requestChat }),
      });

      return response.data;
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
        .map((e) => encode(e.content).length)
        .reduce((acc, cur) => acc + cur);

      return max - encodedChatTokenNumber;
    } else {
      return 0;
    }
  }
}
