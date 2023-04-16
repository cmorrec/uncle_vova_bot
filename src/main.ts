import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getBotToken } from 'nestjs-telegraf';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './env-validator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService: ConfigService<EnvironmentVariables> =
    app.get(ConfigService);
  const webhookPath = configService.get<string>('WEBHOOK_PATH');

  if (webhookPath) {
    const bot = app.get(getBotToken());
    app.use(bot.webhookCallback(webhookPath));
  }
  await app.listen(8080);
}
bootstrap();
