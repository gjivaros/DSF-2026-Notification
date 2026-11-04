import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { WEBHOOKS_QUEUE, WebhooksService } from './webhooks.service';

@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOKS_QUEUE })],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
