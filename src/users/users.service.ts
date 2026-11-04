import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '../common/crypto';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput, SetUserApplicationsInput, UpdateUserStatusInput } from './users.inputs';

type Tx = Prisma.TransactionClient;

const userInclude = { memberships: { include: { application: true } } } satisfies Prisma.UserInclude;
type UserWithApps = Prisma.UserGetPayload<{ include: typeof userInclude }>;

// Only the root admin manages users; created users are application admins
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: userInclude });
    return users.map((user) => this.toView(user));
  }

  async create(input: CreateUserInput) {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await this.assertApplicationsExist(tx, input.applicationIds);
        return tx.user.create({
          data: {
            email: input.email.toLowerCase(),
            passwordHash: hashPassword(input.password),
            role: UserRole.APP_ADMIN,
            memberships: { create: input.applicationIds.map((applicationId) => ({ applicationId })) },
          },
          include: userInclude,
        });
      });
      return this.toView(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.emailTaken();
      throw error;
    }
  }

  async setApplications(userId: string, input: SetUserApplicationsInput) {
    const user = await this.prisma.$transaction(async (tx) => {
      await this.findAppAdmin(tx, userId);
      await this.assertApplicationsExist(tx, input.applicationIds);
      await tx.applicationMember.deleteMany({ where: { userId } });
      await tx.applicationMember.createMany({
        data: input.applicationIds.map((applicationId) => ({ userId, applicationId })),
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
    });
    return this.toView(user);
  }

  // Disabling a user also ends its sessions
  async updateStatus(userId: string, input: UpdateUserStatusInput) {
    const user = await this.prisma.$transaction(async (tx) => {
      await this.findAppAdmin(tx, userId);
      if (input.status === UserStatus.disabled) await tx.session.deleteMany({ where: { userId } });
      return tx.user.update({ where: { id: userId }, data: { status: input.status }, include: userInclude });
    });
    return this.toView(user);
  }

  private async findAppAdmin(tx: Tx, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.userNotFound();
    if (user.role === UserRole.ROOT) throw Errors.rootUserImmutable();
    return user;
  }

  private async assertApplicationsExist(tx: Tx, applicationIds: string[]) {
    const count = await tx.application.count({ where: { id: { in: applicationIds } } });
    if (count !== applicationIds.length) throw Errors.applicationNotFound();
  }

  private toView(user: UserWithApps) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      applications: user.memberships.map((m) => ({ id: m.application.id, code: m.application.code })),
    };
  }
}
