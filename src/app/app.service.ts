import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

type DependencyStatus = 'up' | 'down';

@Injectable()
export class AppService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.redis = new Redis(config.getOrThrow('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async health() {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      this.check(() => this.redis.ping()),
    ]);
    if (database === 'down' || redis === 'down') {
      throw Errors.serviceUnavailable(`Dependencies down: database=${database}, redis=${redis}`);
    }
    return { status: 'ok', database, redis };
  }

  private async check(probe: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
