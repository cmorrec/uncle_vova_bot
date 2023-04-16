import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { I18nModule, QueryResolver } from 'nestjs-i18n';
import { ScheduleModule } from '@nestjs/schedule';
import { TelegrafModule } from 'nestjs-telegraf';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppUpdate } from './app.update';
import { EnvironmentVariables, validateEnv } from './env-validator';
import { ChatGPTModule } from './chat-gpt/chat-gpt.module';
import { RepoModule } from './repo/repo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (
        configService: ConfigService<EnvironmentVariables>,
      ) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '',
        ...(configService.get<string>('WEBHOOK_DOMAIN') &&
        configService.get<string>('WEBHOOK_PATH')
          ? {
              launchOptions: {
                webhook: {
                  domain: configService.get<string>('WEBHOOK_DOMAIN') ?? '',
                  hookPath: configService.get<string>('WEBHOOK_PATH') ?? '',
                },
              },
            }
          : {}),
      }),
      inject: [ConfigService],
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'ru',
      loaderOptions: {
        path: join(__dirname, '/i18n/'),
        watch: true,
      },
      typesOutputPath: join(__dirname, '../src/generated/i18n.generated.ts'),
      resolvers: [{ use: QueryResolver, options: ['lang'] }],
    }),
    RepoModule,
    ChatGPTModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppUpdate],
})
export class AppModule {}
