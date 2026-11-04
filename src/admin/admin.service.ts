import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors';
import { businessDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStatsQuery } from './admin.inputs';

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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

  async applications() {
    const day = businessDay(new Date());
    const applications = await this.prisma.application.findMany({
      orderBy: { code: 'asc' },
      include: { quotaUsages: { where: { day } } },
    });
    return applications.map((app) => ({
      code: app.code,
      name: app.name,
      status: app.status,
      dailyQuota: app.dailyQuota,
      usedToday: app.quotaUsages[0]?.usedSegments ?? 0,
    }));
  }
}
