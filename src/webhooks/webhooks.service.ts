import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { hmacSha256Hex, safeEqual } from '../common/crypto';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export const WEBHOOKS_QUEUE = 'webhooks';

export interface WebhookJobData {
  smsId: string;
  status: SmsStatus;
}

// Signed payload: "<timestamp>.<raw body>", so a captured request cannot be replayed with another timestamp
export function buildWebhookSignature(timestamp: number, body: string, secret: string): string {
  return `sha256=${hmacSha256Hex(`${timestamp}.${body}`, secret)}`;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly retryBaseDelay: number;

  constructor(
    @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue<WebhookJobData>,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.retryBaseDelay = config.getOrThrow<number>('SMS_RETRY_BASE_DELAY_MS');
  }

  notify(smsId: string, status: SmsStatus) {
    return this.queue.add(
      'notify',
      { smsId, status },
      {
        attempts: 4,
        backoff: { type: 'exponential', delay: this.retryBaseDelay },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }

  async verifyAndLog(code: string, timestamp: string, signature: string, rawBody?: Buffer) {
    const application = code
      ? await this.prisma.application.findUnique({ where: { code } })
      : null;
    const valid =
      !!application?.webhookSecret &&
      typeof signature === 'string' &&
      safeEqual(signature, buildWebhookSignature(Number(timestamp), rawBody?.toString() ?? '', application.webhookSecret));
    const event = valid ? JSON.parse(rawBody!.toString()) : {};
    this.logger.log(`Webhook received app=${code} sms=${event.smsId} status=${event.status} signatureValid=${valid}`);
    if (!valid) throw Errors.invalidSignature();
    return { received: true };
  }
}
