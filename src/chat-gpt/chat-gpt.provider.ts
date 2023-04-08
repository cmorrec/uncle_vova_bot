import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatCompletionRequestMessage,
  Configuration,
  OpenAIApi,
} from 'openai';
import { EnvironmentVariables } from 'src/env-validator';
import { handleError } from 'src/utils/handle-error';

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
        temperature: 1,
        max_tokens: 3000,
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
        temperature: 1,
        max_tokens: 3000,
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
}
