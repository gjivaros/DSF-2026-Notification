import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { buildWebhookSignature, WEBHOOKS_QUEUE, WebhookJobData } from './webhooks.service';

@Processor(WEBHOOKS_QUEUE, { concurrency: 50 })
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const sms = await this.prisma.sms.findUnique({
      where: { id: job.data.smsId },
      include: { application: true },
    });
    const { webhookUrl, webhookSecret, code } = sms?.application ?? {};
    if (!sms || !webhookUrl || !webhookSecret) return;

    // Never includes the text: OTP codes must not leave the gateway
    const body = JSON.stringify({
      event: 'sms.status',
      smsId: sms.id,
      campaignId: sms.campaignId,
      reference: sms.reference,
      status: job.data.status,
      failureReason: sms.failureReason,
      segments: sms.segments,
      occurredAt: new Date().toISOString(),
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Code': code as string,
        'X-Timestamp': String(timestamp),
        'X-Signature': buildWebhookSignature(timestamp, body, webhookSecret),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Webhook responded with HTTP ${response.status}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData>, error: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.warn(`Webhook gave up sms=${job.data.smsId} status=${job.data.status}: ${error.message}`);
    }
  }
}
