import { DateTime } from 'luxon';
import { Update, Ctx, Start, Help, On } from 'nestjs-telegraf';

import { AppService } from './app.service';
import { BotContext } from './interfaces/context.interface';

@Update()
export class AppUpdate {
  constructor(private readonly service: AppService) {}

  @Start()
  async start(@Ctx() ctx: BotContext) {
    const chat = await this.service.saveChatMiddleware(ctx);

    if (chat) {
      const startMessage = await this.service.getStartMessage();
      await this.replyOnMessage({
        ctx,
        text: startMessage,
        needSave: false,
      });
    }
  }

  @Help()
  async help(@Ctx() ctx: BotContext) {
    const chat = await this.service.saveChatMiddleware(ctx);

    if (chat) {
      const helpMessage = await this.service.getHelpMessage();
      await this.replyOnMessage({
        ctx,
        text: helpMessage,
        needSave: false,
      });
    }
  }

  @On('message')
  async onMessage(@Ctx() ctx: BotContext) {
    // TODO update(delete) before release
    await this.service.saveChatMiddleware(ctx);
    const updateDBInfo = await this.service.saveMessageMiddleware(ctx);
    const result = updateDBInfo
      ? await this.service.getAnswer(updateDBInfo)
      : undefined;

    if (result) {
      await this.replyOnMessage({
        ctx,
        text: result.answer,
        isFormal: result.isFormal,
        needSave: true,
      });
    }
  }

  private async replyOnMessage({
    ctx,
    isFormal,
    needSave,
    text,
  }: {
    ctx: BotContext;
    text: string;
    isFormal?: boolean;
    needSave: boolean;
  }) {
    const newMessage = await ctx.reply(text, {
      reply_to_message_id: ctx.update.message.message_id,
    });
    newMessage.date = DateTime.local().toSeconds();

    console.log(
      'Replied Message: ',
      JSON.stringify(newMessage, null, 3),
      '\n\n\n',
    );

    await this.service.saveReplyMessage({
      isFormal,
      needSave,
      newMessage: newMessage as any,
    });
  }
}
