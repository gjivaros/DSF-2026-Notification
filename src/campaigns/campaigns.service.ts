import { Injectable } from '@nestjs/common';
import { Campaign, Operator, SmsCategory, SmsStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppPrincipal } from '../auth/auth.types';
import { AppException, Errors } from '../common/errors';
import { resolveOperator } from '../common/phone';
import { computeSegments } from '../common/segments';
import { businessDay, computeSendAt } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { SmsQueueService } from '../sms/sms.queue';
import { CreateCampaignInput, ListCampaignsQuery } from './campaigns.inputs';

const MAX_RECIPIENTS = 500;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly queue: SmsQueueService,
  ) {}

  // All or nothing: one invalid recipient or a quota overflow rejects the whole campaign
  async create(principal: AppPrincipal, input: CreateCampaignInput) {
    if (input.recipients.length > MAX_RECIPIENTS) throw Errors.tooManyRecipients(MAX_RECIPIENTS);

    const invalid: string[] = [];
    const recipients: { recipient: string; operator: Operator }[] = [];
    for (const recipient of input.recipients) {
      try {
        recipients.push({ recipient, operator: resolveOperator(recipient) });
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        invalid.push(recipient);
      }
    }
    if (invalid.length) throw Errors.invalidRecipients(invalid);

    const { isUnicode, length, segments } = computeSegments(input.text);
    const now = new Date();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    const sendAt = computeSendAt(SmsCategory.INFO, scheduledAt, now);
    const campaignId = randomUUID();

    const smsList = await this.prisma.$transaction(async (tx) => {
      await this.quota.reserve(tx, principal.applicationId, segments * recipients.length, businessDay(now));
      await tx.campaign.create({
        data: {
          id: campaignId,
          applicationId: principal.applicationId,
          text: input.text,
          segments,
          recipientCount: recipients.length,
          reference: input.reference,
          scheduledAt,
        },
      });
      return tx.sms.createManyAndReturn({
        data: recipients.map(({ recipient, operator }) => ({
          applicationId: principal.applicationId,
          campaignId,
          recipient,
          operator,
          category: SmsCategory.INFO,
          text: input.text,
          isUnicode,
          length,
          segments,
          reference: input.reference,
          scheduledAt,
          sendAt,
        })),
      });
    });
    await this.queue.enqueueBulk(smsList);

    return {
      id: campaignId,
      recipientCount: recipients.length,
      segmentsPerSms: segments,
      totalSegments: segments * recipients.length,
      status: SmsStatus.pending,
    };
  }

  async findOne(principal: AppPrincipal, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, applicationId: principal.applicationId },
    });
    if (!campaign) throw Errors.campaignNotFound();
    const [view] = await this.toViews([campaign]);
    return view;
  }

  async list(principal: AppPrincipal, query: ListCampaignsQuery) {
    const where = { applicationId: principal.applicationId };
    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return { items: await this.toViews(campaigns), page: query.page, limit: query.limit, total };
  }

  // Campaign status is derived from its SMS: one groupBy for the whole page
  private async toViews(campaigns: Campaign[]) {
    const counts = await this.prisma.sms.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaigns.map((c) => c.id) } },
      _count: { _all: true },
    });
    return campaigns.map((campaign) => {
      const countsByStatus = Object.fromEntries(Object.values(SmsStatus).map((s) => [s, 0])) as Record<SmsStatus, number>;
      for (const row of counts) {
        if (row.campaignId === campaign.id) countsByStatus[row.status] = row._count._all;
      }
      return {
        id: campaign.id,
        text: campaign.text,
        segmentsPerSms: campaign.segments,
        recipientCount: campaign.recipientCount,
        reference: campaign.reference,
        scheduledAt: campaign.scheduledAt,
        createdAt: campaign.createdAt,
        countsByStatus,
      };
    });
  }
}
