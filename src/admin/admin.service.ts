import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppPrincipal, UserPrincipal } from '../auth/auth.types';
import { sha256 } from '../common/crypto';
import { Errors } from '../common/errors';
import { businessDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStatsQuery, CreateApplicationInput, UpdateApplicationStatusInput } from './admin.inputs';

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ABAC for humans: ROOT reaches every application, APP_ADMIN only its memberships (404 otherwise)
  async actAs(principal: UserPrincipal, applicationId: string, options: { write?: boolean } = {}): Promise<AppPrincipal> {
    const allowed = principal.role === 'ROOT' || principal.applicationIds.includes(applicationId);
    const application = allowed ? await this.prisma.application.findUnique({ where: { id: applicationId } }) : null;
    if (!application) throw Errors.applicationNotFound();
    if (options.write && application.status !== ApplicationStatus.active) throw Errors.applicationSuspended();
    return { role: 'APP', applicationId: application.id, code: application.code };
  }

  // Defaults to the current GMT+1 day; range is [from, to[
  async stats(query: AdminStatsQuery) {
    const startOfToday = new Date(businessDay(new Date()).getTime() - OFFSET_MS);
    const from = query.from ? new Date(query.from) : startOfToday;
    const to = query.to ? new Date(query.to) : new Date(startOfToday.getTime() + DAY_MS);
    if (from >= to) throw Errors.validation('from must be before to');

    const where = { createdAt: { gte: from, lt: to } };
    const [byApplication, byOperator, byStatus, applications] = await Promise.all([
      this.prisma.sms.groupBy({ by: ['applicationId'], where, _count: { _all: true }, _sum: { segments: true } }),
      this.prisma.sms.groupBy({ by: ['operator'], where, _count: { _all: true } }),
      this.prisma.sms.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.application.findMany({ select: { id: true, code: true } }),
    ]);
    const codeOf = new Map(applications.map((a) => [a.id, a.code]));

    return {
      from,
      to,
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byApplication: byApplication.map((row) => ({
        code: codeOf.get(row.applicationId),
        count: row._count._all,
        segments: row._sum.segments ?? 0,
      })),
      byOperator: byOperator.map((row) => ({ operator: row.operator, count: row._count._all })),
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
    };
  }

  async applications(principal: UserPrincipal) {
    const day = businessDay(new Date());
    const applications = await this.prisma.application.findMany({
      where: principal.role === 'ROOT' ? {} : { id: { in: principal.applicationIds } },
      orderBy: { code: 'asc' },
      include: { quotaUsages: { where: { day } } },
    });
    return applications.map((app) => ({
      id: app.id,
      code: app.code,
      name: app.name,
      status: app.status,
      dailyQuota: app.dailyQuota,
      webhookUrl: app.webhookUrl,
      usedToday: app.quotaUsages[0]?.usedSegments ?? 0,
      createdAt: app.createdAt,
    }));
  }

  // The API key and webhook secret are only returned here, once
  async createApplication(input: CreateApplicationInput) {
    const apiKey = randomBytes(24).toString('base64url');
    const webhookSecret = input.webhookUrl ? randomBytes(32).toString('hex') : null;
    try {
      const app = await this.prisma.application.create({
        data: {
          code: input.code,
          name: input.name,
          dailyQuota: input.dailyQuota,
          apiKeyHash: sha256(apiKey),
          webhookUrl: input.webhookUrl ?? null,
          webhookSecret,
          statusHistory: { create: { status: ApplicationStatus.active, reason: 'Initial status' } },
        },
      });
      return { id: app.id, code: app.code, name: app.name, dailyQuota: app.dailyQuota, status: app.status, apiKey, webhookSecret };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.applicationCodeTaken();
      throw error;
    }
  }

  async updateApplicationStatus(applicationId: string, input: UpdateApplicationStatusInput) {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({ where: { id: applicationId } });
      if (!app) throw Errors.applicationNotFound();
      if (app.status !== input.status) {
        await tx.application.update({ where: { id: applicationId }, data: { status: input.status } });
        await tx.applicationStatusHistory.create({
          data: { applicationId, status: input.status, reason: input.reason },
        });
      }
      return this.statusHistory(applicationId, tx);
    });
  }

  async statusHistory(applicationId: string, db: Prisma.TransactionClient = this.prisma) {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      include: { statusHistory: { orderBy: { changedAt: 'desc' } } },
    });
    if (!app) throw Errors.applicationNotFound();
    return {
      id: app.id,
      code: app.code,
      status: app.status,
      history: app.statusHistory.map((h) => ({ status: h.status, reason: h.reason, changedAt: h.changedAt })),
    };
  }
}
