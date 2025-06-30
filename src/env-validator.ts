import { plainToClass, Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  TELEGRAM_BOT_TOKEN: string;

  @IsString()
  TELEGRAM_BOT_USERNAME: string;

  @IsString()
  TELEGRAM_BOT_NAME: string;

  @IsString()
  @IsOptional()
  OWNER_IDS?: string;

  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  MONGODB_URI: string;
  
  @IsString()
  @IsOptional()
  WEBHOOK_DOMAIN?: string;
  
  @IsString()
  @IsOptional()
  WEBHOOK_PATH?: string;
  
  @IsString()
  @IsOptional()
  WEBHOOK_SECRET_TOKEN?: string;
  
  @IsInt()
  @Transform((e) => Number(e.value))
  PORT: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
