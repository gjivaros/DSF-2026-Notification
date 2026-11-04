import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { AppThrottlerGuard } from '../common/app-throttler.guard';
import { HttpExceptionFilter } from '../common/http-exception.filter';
import { validateEnv } from '../config/env.validation';
import { redisConnection } from '../config/redis';
import { OperatorsModule } from '../operators/operators.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotaModule } from '../quota/quota.module';
import { SmsModule } from '../sms/sms.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 1000, limit: config.getOrThrow<number>('RATE_LIMIT_PER_SECOND') }],
        storage: new ThrottlerStorageRedisService(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    PrismaModule,
    AuthModule,
    QuotaModule,
    SmsModule,
    OperatorsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Global guards run in this order: rate limit first, then authentication
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
