import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { QuotaModule } from '../quota/quota.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SmsController } from './sms.controller';
import { SMS_QUEUE, SmsQueueService } from './sms.queue';
import { SmsService } from './sms.service';

@Module({
  imports: [QuotaModule, IdempotencyModule, WebhooksModule, BullModule.registerQueue({ name: SMS_QUEUE })],
  controllers: [SmsController],
  providers: [SmsService, SmsQueueService],
  exports: [SmsService, SmsQueueService],
})
export class SmsModule {}
