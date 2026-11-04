import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { createValidationPipe } from './common/validation.pipe';

async function bootstrap() {
  // rawBody is required to verify HMAC signatures on incoming callbacks
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

void bootstrap();
