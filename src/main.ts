import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './env-validator';

// setInterval(() => {
//   const used = process.memoryUsage();
//   console.log('Memory usage:');
//   for (let key in used) {
//     console.log(`${key} ${Math.round(used[key as keyof NodeJS.MemoryUsage] / 1024 / 1024 * 100) / 100} MB`);
//   }
//   console.log('\n');
// }, 10000);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService: ConfigService<EnvironmentVariables> = await app.resolve(
    ConfigService,
  );
  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
}
bootstrap();
