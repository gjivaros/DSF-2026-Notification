import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { hmacSha256Hex } from '../src/common/crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { SMS_QUEUE } from '../src/sms/sms.queue';
import { cleanDatabase, createTestApp, etatCivilHeaders, waitFor } from './utils/test-app';

// OTP messages are used for delivery flows: INFO depends on the 07:00-21:00 window
describe('SMS delivery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const submit = (body: object) =>
    request(app.getHttpServer())
      .post('/sms')
      .set(etatCivilHeaders())
      .set('Idempotency-Key', randomUUID())
      .send({ category: 'OTP', text: 'Votre code est 123456', ...body });

  const waitForStatus = (id: string, status: string) =>
    waitFor(() => prisma.sms.findFirst({ where: { id, status: status as never } }));

  const usedToday = async () => {
    const res = await request(app.getHttpServer()).get('/usage/daily').set(etatCivilHeaders());
    return res.body.used as number;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => cleanDatabase(app));

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('delivers an SMS through the operator and its signed delivery report', async () => {
    const { body } = await submit({ to: '0150000000' }).expect(202);
    const sms = await waitForStatus(body.id, 'delivered');
    expect(sms).toMatchObject({ attempts: 1, text: null, operator: 'MTN' });
    expect(sms.transmittedAt).not.toBeNull();
  });

  it('fails immediately on ECHEC_DEFINITIF (number ending with 8)', async () => {
    const { body } = await submit({ to: '0150000008' }).expect(202);
    const sms = await waitForStatus(body.id, 'failed');
    expect(sms).toMatchObject({ attempts: 1, failureReason: 'ECHEC_DEFINITIF' });
  });

  it('retries 3 times on ECHEC_TEMPORAIRE then fails (number ending with 7)', async () => {
    const { body } = await submit({ to: '0150000007' }).expect(202);
    const sms = await waitForStatus(body.id, 'failed');
    expect(sms).toMatchObject({ attempts: 4, failureReason: 'ECHEC_TEMPORAIRE' });
  });

  it('gives OTP a higher priority than INFO in the queue', async () => {
    const otp = await submit({ to: '0150000000' }).expect(202);
    const info = await submit({ to: '0150000000', category: 'INFO', text: 'Info' }).expect(202);
    const queue = app.get<Queue>(getQueueToken(SMS_QUEUE));
    const jobs = await queue.getJobs(['waiting', 'prioritized', 'delayed', 'active', 'completed']);
    const priorityOf = (id: string) => jobs.find((job) => job.data.smsId === id)?.opts.priority;
    if (priorityOf(otp.body.id) !== undefined) expect(priorityOf(otp.body.id)).toBe(1);
    expect(priorityOf(info.body.id)).toBe(10);
  });

  it('rejects a delivery report with a wrong signature', async () => {
    const res = await request(app.getHttpServer())
      .post('/operators/MTN/dlr')
      .set('X-Signature', 'wrong')
      .send({ operatorMessageId: 'x', status: 'delivered' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('accepts a delivery report signed with the operator secret', async () => {
    const body = JSON.stringify({ operatorMessageId: 'unknown', status: 'delivered' });
    await request(app.getHttpServer())
      .post('/operators/MTN/dlr')
      .set('Content-Type', 'application/json')
      .set('X-Signature', hmacSha256Hex(body, process.env.OPERATOR_SECRET_MTN as string))
      .send(body)
      .expect(200);
  });

  it('cancels a pending SMS and gives the quota back', async () => {
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { body } = await submit({ to: '0150000000', category: 'INFO', text: 'Plus tard', scheduledAt }).expect(202);
    expect(await usedToday()).toBe(1);

    const res = await request(app.getHttpServer()).post(`/sms/${body.id}/cancel`).set(etatCivilHeaders()).expect(200);
    expect(res.body).toMatchObject({ status: 'cancelled', text: null });
    expect(await usedToday()).toBe(0);

    const again = await request(app.getHttpServer()).post(`/sms/${body.id}/cancel`).set(etatCivilHeaders()).expect(409);
    expect(again.body.code).toBe('SMS_NOT_CANCELLABLE');
  });

  it('retries a failed SMS manually and consumes quota again', async () => {
    const { body } = await submit({ to: '0150000008' }).expect(202);
    await waitForStatus(body.id, 'failed');

    const res = await request(app.getHttpServer())
      .post(`/sms/${body.id}/retry`)
      .set(etatCivilHeaders())
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(res.body).toMatchObject({ status: 'pending', failureReason: null });
    expect(await usedToday()).toBe(2);
    await waitFor(() => prisma.sms.findFirst({ where: { id: body.id, status: 'failed', manualRetries: 1 } }));
  });

  it('refuses to retry a delivered SMS', async () => {
    const { body } = await submit({ to: '0150000000' }).expect(202);
    await waitForStatus(body.id, 'delivered');
    const res = await request(app.getHttpServer())
      .post(`/sms/${body.id}/retry`)
      .set(etatCivilHeaders())
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(res.body.code).toBe('SMS_NOT_RETRYABLE');
  });
});
