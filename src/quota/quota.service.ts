import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import { businessDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

// Postgres DATE literal, independent from the session timezone
const toDateString = (day: Date) => day.toISOString().slice(0, 10);

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  // Atomic: the quota check and the increment happen in a single UPDATE
  async reserve(tx: Tx, applicationId: string, segments: number, day: Date): Promise<void> {
    const date = toDateString(day);
    await tx.$executeRaw`
      INSERT INTO "QuotaUsage" ("applicationId", "day", "usedSegments")
      VALUES (${applicationId}, ${date}::date, 0)
      ON CONFLICT DO NOTHING`;
    const updated = await tx.$executeRaw`
      UPDATE "QuotaUsage" q SET "usedSegments" = q."usedSegments" + ${segments}
      FROM "Application" a
      WHERE q."applicationId" = ${applicationId} AND q."day" = ${date}::date
        AND a."id" = q."applicationId"
        AND q."usedSegments" + ${segments} <= a."dailyQuota"`;
    if (updated === 0) throw Errors.quotaExceeded();
  }

  async release(tx: Tx, applicationId: string, segments: number, day: Date): Promise<void> {
    await tx.$executeRaw`
      UPDATE "QuotaUsage" SET "usedSegments" = GREATEST("usedSegments" - ${segments}, 0)
      WHERE "applicationId" = ${applicationId} AND "day" = ${toDateString(day)}::date`;
  }

  async getDailyUsage(applicationId: string) {
    const day = businessDay(new Date());
    const [application, usage] = await Promise.all([
      this.prisma.application.findUniqueOrThrow({
        where: { id: applicationId },
        select: { dailyQuota: true },
      }),
      this.prisma.quotaUsage.findUnique({
        where: { applicationId_day: { applicationId, day } },
      }),
    ]);
    const used = usage?.usedSegments ?? 0;
    return {
      day: toDateString(day),
      quota: application.dailyQuota,
      used,
      remaining: Math.max(application.dailyQuota - used, 0),
    };
  }
}
