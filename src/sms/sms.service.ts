import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Sms, SmsCategory, SmsStatus } from '@prisma/client';
import { AppPrincipal } from '../auth/auth.types';
import { encryptText } from '../common/crypto';
import { Errors } from '../common/errors';
import { resolveOperator } from '../common/phone';
import { computeSegments } from '../common/segments';
import { businessDay, computeSendAt } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { CreateSmsInput, ListSmsQuery } from './sms.inputs';
import { SmsQueueService } from './sms.queue';

type Tx = Prisma.TransactionClient;

export type SmsTransition = Prisma.SmsUpdateManyMutationInput & { status: SmsStatus };

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly queue: SmsQueueService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.getOrThrow('OTP_ENCRYPTION_KEY');
  }

  async create(principal: AppPrincipal, input: CreateSmsInput) {
    const operator = resolveOperator(input.to);
    const { isUnicode, length, segments } = computeSegments(input.text);
    const now = new Date();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    const sendAt = computeSendAt(input.category, scheduledAt, now);
    const text =
      input.category === SmsCategory.OTP ? encryptText(input.text, this.encryptionKey) : input.text;

    const sms = await this.prisma.$transaction(async (tx) => {
      await this.quota.reserve(tx, principal.applicationId, segments, businessDay(now));
      return tx.sms.create({
        data: {
          applicationId: principal.applicationId,
          recipient: input.to,
          operator,
          category: input.category,
          text,
          isUnicode,
          length,
          segments,
          reference: input.reference,
          scheduledAt,
          sendAt,
        },
      });
    });
    await this.queue.enqueue(sms);
    return { id: sms.id, segments: sms.segments, status: sms.status };
  }

  // Single write path for statuses: the update only applies if the SMS is still in the expected status
  async transition(
    id: string,
    from: SmsStatus,
    data: SmsTransition,
    options: { tx?: Tx; applicationId?: string } = {},
  ): Promise<boolean> {
    const db = options.tx ?? this.prisma;
    const { count } = await db.sms.updateMany({
      where: { id, status: from, applicationId: options.applicationId },
      data,
    });
    if (count === 1) {
      const reason = data.failureReason ? ` reason=${String(data.failureReason)}` : '';
      this.logger.log(`sms=${id} ${from} -> ${data.status}${reason}`);
    }
    return count === 1;
  }

  async cancel(principal: AppPrincipal, id: string) {
    const { applicationId } = principal;
    const sms = await this.prisma.$transaction(async (tx) => {
      const cancelled = await this.transition(
        id,
        SmsStatus.pending,
        { status: SmsStatus.cancelled, cancelledAt: new Date(), text: null },
        { tx, applicationId },
      );
      const sms = await tx.sms.findFirst({ where: { id, applicationId } });
      if (!sms) throw Errors.smsNotFound();
      if (!cancelled) throw Errors.smsNotCancellable();
      await this.quota.release(tx, applicationId, sms.segments, businessDay(sms.createdAt));
      return sms;
    });
    await this.queue.remove(sms);
    return this.toView(sms);
  }

  // A failed SMS goes back to pending with a fresh retry budget and consumes quota again
  async retry(principal: AppPrincipal, id: string) {
    const { applicationId } = principal;
    const now = new Date();
    const sms = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sms.findFirst({ where: { id, applicationId } });
      if (!current) throw Errors.smsNotFound();
      const retried = await this.transition(
        id,
        SmsStatus.failed,
        {
          status: SmsStatus.pending,
          attempts: 0,
          failureReason: null,
          failedAt: null,
          transmittedAt: null,
          operatorMessageId: null,
          manualRetries: { increment: 1 },
          sendAt: computeSendAt(current.category, undefined, now),
        },
        { tx, applicationId },
      );
      if (!retried) throw Errors.smsNotRetryable();
      await this.quota.reserve(tx, applicationId, current.segments, businessDay(now));
      return tx.sms.findUniqueOrThrow({ where: { id } });
    });
    await this.queue.enqueue(sms);
    return this.toView(sms);
  }

  // ABAC: an application only sees its own SMS; others are reported as not found
  async findOne(principal: AppPrincipal, id: string) {
    const sms = await this.prisma.sms.findFirst({
      where: { id, applicationId: principal.applicationId },
    });
    if (!sms) throw Errors.smsNotFound();
    return this.toView(sms);
  }

  async list(principal: AppPrincipal, query: ListSmsQuery) {
    const where: Prisma.SmsWhereInput = {
      applicationId: principal.applicationId,
      status: query.status,
      category: query.category,
      campaignId: query.campaignId,
    };
    const [items, total] = await Promise.all([
      this.prisma.sms.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.sms.count({ where }),
    ]);
    return { items: items.map((sms) => this.toView(sms)), page: query.page, limit: query.limit, total };
  }

  // OTP text is never exposed, even encrypted
  toView(sms: Sms) {
    return {
      id: sms.id,
      campaignId: sms.campaignId,
      recipient: sms.recipient,
      operator: sms.operator,
      category: sms.category,
      text: sms.category === SmsCategory.OTP ? null : sms.text,
      segments: sms.segments,
      status: sms.status,
      failureReason: sms.failureReason,
      attempts: sms.attempts,
      reference: sms.reference,
      scheduledAt: sms.scheduledAt,
      sendAt: sms.sendAt,
      createdAt: sms.createdAt,
      transmittedAt: sms.transmittedAt,
      deliveredAt: sms.deliveredAt,
      failedAt: sms.failedAt,
      cancelledAt: sms.cancelledAt,
    };
  }
}
