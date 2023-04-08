import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ForwardFromChat,
  From,
  Photo,
  Poll,
  Voice,
  TextEntity,
  Sticker,
  Location,
  Document,
} from 'src/interfaces/context.interface';

export type MessageDocument = HydratedDocument<Message>;

export enum MessageType {
  Text = 'Text',
  Photo = 'Photo',
  PhotoCaption = 'PhotoCaption',
  Document = 'Document',
  DocumentCaption = 'DocumentCaption',
  Voice = 'Voice',
  Location = 'Location',
  Poll = 'Poll',
  Sticker = 'Sticker',
  Unknown = 'Unknown',
}

@Schema()
export class Message {
  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true })
  chatId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: Object })
  from: From;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: false })
  text?: string;

  @Prop({ required: false })
  caption?: string;

  @Prop({ required: false })
  replyToMessageId?: string;

  @Prop({ required: false })
  messageThreadId?: string;

  @Prop({ required: false, type: Array })
  photo?: Photo[];

  @Prop({ required: false, type: Object })
  voice?: Voice;

  @Prop({ required: false, type: Object })
  poll?: Poll;

  @Prop({ required: false, type: Object })
  location?: Location;

  @Prop({ required: false, type: Object })
  document?: Document;

  @Prop({ required: false, type: Object })
  forwardFromChat?: ForwardFromChat;

  @Prop({ required: false })
  forwardFromMessageId?: string;

  @Prop({ required: false })
  forwardDate?: Date;

  @Prop({ required: false })
  entities?: TextEntity[];

  @Prop({ required: false, type: Array })
  captionEntities?: TextEntity[];

  @Prop({ required: false, type: Array })
  sticker?: Sticker;

  @Prop({ required: true })
  type: MessageType;

  @Prop({ required: true })
  isMainBotMessage: boolean;

  @Prop({ required: false })
  isFormalMessage?: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
