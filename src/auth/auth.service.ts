import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus } from '@prisma/client';
import { safeEqual, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from './auth.types';

type Headers = Record<string, string | string[] | undefined>;

const header = (headers: Headers, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async resolvePrincipal(headers: Headers): Promise<Principal | null> {
    const adminKey = header(headers, 'x-admin-key');
    if (adminKey) {
      return safeEqual(adminKey, this.config.getOrThrow('ADMIN_API_KEY'))
        ? { role: 'ADMIN' }
        : null;
    }

    const code = header(headers, 'x-app-code');
    const apiKey = header(headers, 'x-api-key');
    if (!code || !apiKey) return null;

    const application = await this.prisma.application.findUnique({
      where: { code },
      select: { id: true, code: true, apiKeyHash: true, status: true },
    });
    if (application?.status !== ApplicationStatus.active) return null;
    if (!safeEqual(sha256(apiKey), application.apiKeyHash)) return null;
    return { role: 'APP', applicationId: application.id, code: application.code };
  }
}
