import { INestApplication, Type } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app/app.module';
import { createValidationPipe } from '../../src/common/validation.pipe';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SMS_QUEUE } from '../../src/sms/sms.queue';
import { WEBHOOKS_QUEUE } from '../../src/webhooks/webhooks.service';

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

export async function loginHeaders(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

export const rootHeaders = (app: INestApplication) =>
  loginHeaders(app, process.env.ROOT_ADMIN_EMAIL as string, process.env.ROOT_ADMIN_PASSWORD as string);

// Removes the data created by tests; seeded applications are kept
export async function cleanDatabase(app: INestApplication): Promise<void> {
  for (const name of [SMS_QUEUE, WEBHOOKS_QUEUE]) {
    await app.get<Queue>(getQueueToken(name)).obliterate({ force: true });
  }
  const prisma = app.get(PrismaService);
  await prisma.idempotencyKey.deleteMany();
  await prisma.sms.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.quotaUsage.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { role: 'APP_ADMIN' } });
  const seeded = { code: { notIn: ['ETATCIVIL', 'COURRIER'] } };
  await prisma.applicationStatusHistory.deleteMany({ where: { application: seeded } });
  await prisma.application.deleteMany({ where: seeded });
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
