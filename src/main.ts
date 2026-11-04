import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { createValidationPipe } from './common/validation.pipe';
import { setupSwagger } from './config/swagger';

async function bootstrap() {
  // rawBody is required to verify HMAC signatures on incoming callbacks
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  setupSwagger(app);
  // Admin dashboard: static page consuming the /auth and /admin routes
  app.useStaticAssets(join(__dirname, '..', '..', 'public', 'dashboard'), { prefix: '/dashboard' });
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

void bootstrap();
