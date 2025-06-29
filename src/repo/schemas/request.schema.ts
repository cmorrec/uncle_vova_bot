import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import OpenAITypes from 'openai';

export enum ChatGPTRequestType {
  Chat = 'Chat',
  Completion = 'Completion',
  // FineTune = 'FineTune',
}

export type RequestDocument = HydratedDocument<Request>;

export type ChatGPTResponseToSave = {
  text?: string;
  model: string;
  usage?: object;
}

@Schema()
export class Request {
  @Prop({ required: false })
  completionRequest?: string;

  @Prop({ required: false, type: Array })
  chatRequest?: any;

  @Prop({ required: false, type: Object })
  response?: ChatGPTResponseToSave;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true })
  type: ChatGPTRequestType;

  @Prop({ required: false, type: Object })
  error?: any;
}

export const RequestSchema = SchemaFactory.createForClass(Request);
