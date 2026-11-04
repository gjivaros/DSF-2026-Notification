import { INestApplication, Type } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app/app.module';
import { createValidationPipe } from '../../src/common/validation.pipe';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SMS_QUEUE } from '../../src/sms/sms.queue';

// Same setup as main.ts; extra controllers can be mounted for test-only routes
export async function createTestApp(controllers: Type[] = []): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(createValidationPipe());
  // Listening for real: the operator simulator calls back APP_URL with delivery reports
  await app.listen(Number(process.env.PORT));
  return app;
}

export const etatCivilHeaders = () => ({
  'X-App-Code': 'ETATCIVIL',
  'X-Api-Key': process.env.SEED_ETATCIVIL_API_KEY as string,
});

export const courrierHeaders = () => ({
  'X-App-Code': 'COURRIER',
  'X-Api-Key': process.env.SEED_COURRIER_API_KEY as string,
});

export const adminHeaders = () => ({
  'X-Admin-Key': process.env.ADMIN_API_KEY as string,
});

// Removes the data created by tests; seeded applications are kept
export async function cleanDatabase(app: INestApplication): Promise<void> {
  await app.get<Queue>(getQueueToken(SMS_QUEUE)).obliterate({ force: true });
  const prisma = app.get(PrismaService);
  await prisma.idempotencyKey.deleteMany();
  await prisma.sms.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.quotaUsage.deleteMany();
}

export async function waitFor<T>(probe: () => Promise<T | null | undefined | false>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('waitFor timed out');
}
