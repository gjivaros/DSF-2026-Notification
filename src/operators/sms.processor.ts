import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { FailureReason, SmsCategory, SmsStatus } from '@prisma/client';
import { DelayedError, Job, UnrecoverableError } from 'bullmq';
import { decryptText } from '../common/crypto';
import { isInInfoWindow, nextInfoWindow } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_QUEUE, SmsJobData } from '../sms/sms.queue';
import { SmsService } from '../sms/sms.service';
import { OperatorError, OperatorSimulator } from './operators.simulator';

@Processor(SMS_QUEUE, { concurrency: 50 })
export class SmsProcessor extends WorkerHost {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly simulator: OperatorSimulator,
    config: ConfigService,
  ) {
    super();
    this.encryptionKey = config.getOrThrow('OTP_ENCRYPTION_KEY');
  }

  async process(job: Job<SmsJobData>, token?: string): Promise<void> {
    const sms = await this.prisma.sms.findUnique({ where: { id: job.data.smsId } });
    // Cancelled (or already handled) in the meantime
    if (!sms || sms.status !== SmsStatus.pending || !sms.text) return;

    // Backlog or late retry: INFO never leaves outside 07:00-21:00 GMT+1
    const now = new Date();
    if (sms.category === SmsCategory.INFO && !isInInfoWindow(now)) {
      await job.moveToDelayed(nextInfoWindow(now).getTime(), token);
      throw new DelayedError();
    }

    await this.prisma.sms.update({ where: { id: sms.id }, data: { attempts: { increment: 1 } } });
    const text = sms.category === SmsCategory.OTP ? decryptText(sms.text, this.encryptionKey) : sms.text;

    try {
      const { operatorMessageId } = await this.simulator.send(sms.operator, sms.recipient, text);
      const transmitted = await this.smsService.transition(sms.id, SmsStatus.pending, {
        status: SmsStatus.transmitted,
        operatorMessageId,
        transmittedAt: new Date(),
        failureReason: null,
      });
      if (transmitted) this.simulator.scheduleDeliveryReport(sms.operator, operatorMessageId);
    } catch (error) {
      if (!(error instanceof OperatorError)) throw error;
      const isLastAttempt =
        error.reason === FailureReason.ECHEC_DEFINITIF ||
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.smsService.transition(sms.id, SmsStatus.pending, {
          status: SmsStatus.failed,
          failureReason: error.reason,
          failedAt: new Date(),
        });
        throw new UnrecoverableError(error.reason);
      }
      // Temporary failure: BullMQ retries with an exponential backoff
      await this.prisma.sms.update({ where: { id: sms.id }, data: { failureReason: error.reason } });
      throw error;
    }
  }
}
