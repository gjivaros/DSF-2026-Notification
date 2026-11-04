import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sms, SmsCategory } from '@prisma/client';
import { JobsOptions, Queue } from 'bullmq';

export const SMS_QUEUE = 'sms';

export interface SmsJobData {
  smsId: string;
}

// BullMQ: the lower the number, the higher the priority
const PRIORITY: Record<SmsCategory, number> = { OTP: 1, INFO: 10 };
// 1 attempt + 3 automatic retries
const MAX_ATTEMPTS = 4;

@Injectable()
export class SmsQueueService {
  private readonly retryBaseDelay: number;

  constructor(
    @InjectQueue(SMS_QUEUE) private readonly queue: Queue<SmsJobData>,
    config: ConfigService,
  ) {
    this.retryBaseDelay = config.getOrThrow<number>('SMS_RETRY_BASE_DELAY_MS');
  }

  enqueue(sms: Sms) {
    return this.queue.add('send', { smsId: sms.id }, this.jobOptions(sms));
  }

  enqueueBulk(smsList: Sms[]) {
    return this.queue.addBulk(
      smsList.map((sms) => ({ name: 'send', data: { smsId: sms.id }, opts: this.jobOptions(sms) })),
    );
  }

  // Best effort: an active job cannot be removed, the worker skips non-pending SMS anyway
  async remove(sms: Sms) {
    await this.queue.remove(this.jobId(sms)).catch(() => undefined);
  }

  private jobId(sms: Sms) {
    return `${sms.id}-${sms.manualRetries}`;
  }

  private jobOptions(sms: Sms): JobsOptions {
    return {
      jobId: this.jobId(sms),
      delay: Math.max(0, sms.sendAt.getTime() - Date.now()),
      priority: PRIORITY[sms.category],
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: this.retryBaseDelay },
      removeOnComplete: true,
      removeOnFail: 1000,
    };
  }
}
