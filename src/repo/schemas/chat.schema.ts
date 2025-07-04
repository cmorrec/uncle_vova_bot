import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ChatType } from 'src/interfaces/context.interface';

export type ChatDocument = HydratedDocument<Chat>;

@Schema()
export class Chat {
  @Prop({ required: true })
  chatId: string;

  @Prop({ required: false })
  title?: string;

  @Prop({
    required: true,
    // type: [{ type: mongoose.Schema.Types.String, ref: 'User' }],
  })
  chatMemberIds: string[];

  @Prop({ required: false })
  botDescription?: string;

  @Prop({ required: false })
  botQuotes?: string[];

  @Prop({ required: false })
  botIsRude?: boolean;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: Date })
  updatedAt: Date;

  @Prop({ required: true })
  chatType: ChatType;

  @Prop({ required: true })
  wakeUp: boolean;

  @Prop({ required: true })
  active: boolean;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
