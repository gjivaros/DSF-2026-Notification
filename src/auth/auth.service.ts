import { Injectable } from '@nestjs/common';
import { ApplicationStatus, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { safeEqual, sha256, verifyPassword } from '../common/crypto';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { LoginInput } from './auth.inputs';
import { Principal, UserPrincipal } from './auth.types';

type Headers = Record<string, string | string[] | undefined>;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const header = (headers: Headers, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // Humans use a bearer session token; applications use their code and API key
  async resolvePrincipal(headers: Headers): Promise<Principal | null> {
    const authorization = header(headers, 'authorization');
    if (authorization?.startsWith('Bearer ')) {
      return this.resolveSession(authorization.slice('Bearer '.length));
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

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    // Same error whether the email exists or not
    if (!user || user.status !== UserStatus.active || !verifyPassword(input.password, user.passwordHash)) {
      throw Errors.invalidCredentials();
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({ data: { tokenHash: sha256(token), userId: user.id, expiresAt } });
    return { token, expiresAt, user: await this.me(user.id) };
  }

  async logout(headers: Headers) {
    const token = header(headers, 'authorization')?.slice('Bearer '.length) ?? '';
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { application: true } } },
    });
    const applications =
      user.role === 'ROOT'
        ? await this.prisma.application.findMany({ orderBy: { code: 'asc' } })
        : user.memberships.map((m) => m.application);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      applications: applications.map((a) => ({ id: a.id, code: a.code, name: a.name, status: a.status })),
    };
  }

  private async resolveSession(token: string): Promise<UserPrincipal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { memberships: true } } },
    });
    if (!session || session.expiresAt < new Date() || session.user.status !== UserStatus.active) return null;
    const { user } = session;
    if (user.role === 'ROOT') return { role: 'ROOT', userId: user.id, email: user.email };
    return {
      role: 'APP_ADMIN',
      userId: user.id,
      email: user.email,
      applicationIds: user.memberships.map((m) => m.applicationId),
    };
  }
}
