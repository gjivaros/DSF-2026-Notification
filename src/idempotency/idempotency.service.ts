import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { hmacSha256Hex } from '../common/crypto';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

const KEY_TTL_MS = 24 * 60 * 60 * 1000;

export interface StoredResponse<T> {
  status: number;
  body: T;
}

@Injectable()
export class IdempotencyService {
  private readonly hashSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.hashSecret = `idempotency:${config.getOrThrow('OTP_ENCRYPTION_KEY')}`;
  }

  // Keyed hash: a plain SHA-256 of an OTP body could be brute-forced back to the code
  hashRequest(method: string, route: string, body: unknown): string {
    return hmacSha256Hex(`${method} ${route} ${JSON.stringify(body)}`, this.hashSecret);
  }

  async execute<T>(
    applicationId: string,
    key: string,
    requestHash: string,
    handler: () => Promise<StoredResponse<T>>,
  ): Promise<StoredResponse<T>> {
    const replay = await this.acquire<T>(applicationId, key, requestHash);
    if (replay) return replay;

    const where = { applicationId_key: { applicationId, key } };
    try {
      const response = await handler();
      await this.prisma.idempotencyKey.update({
        where,
        data: {
          responseStatus: response.status,
          responseBody: response.body as Prisma.InputJsonValue,
        },
      });
      return response;
    } catch (error) {
      // A failed request does not consume the key, so the client can retry it
      await this.prisma.idempotencyKey.delete({ where });
      throw error;
    }
  }

  // Returns the stored response to replay, or null when this request now owns the key
  private async acquire<T>(
    applicationId: string,
    key: string,
    requestHash: string,
  ): Promise<StoredResponse<T> | null> {
    try {
      await this.prisma.idempotencyKey.create({ data: { applicationId, key, requestHash } });
      return null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }

    // An expired key is taken over atomically, as if it did not exist
    const takenOver = await this.prisma.idempotencyKey.updateMany({
      where: { applicationId, key, createdAt: { lt: new Date(Date.now() - KEY_TTL_MS) } },
      data: { requestHash, responseStatus: null, responseBody: Prisma.DbNull, createdAt: new Date() },
    });
    if (takenOver.count === 1) return null;

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { applicationId_key: { applicationId, key } },
    });
    // Deleted in the meantime by a failed request: let the client retry
    if (!existing) throw Errors.idempotencyInProgress();
    if (existing.requestHash !== requestHash) throw Errors.idempotencyKeyReused();
    if (existing.responseStatus === null) throw Errors.idempotencyInProgress();
    return { status: existing.responseStatus, body: existing.responseBody as T };
  }
}
