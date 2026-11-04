import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, courrierHeaders, createTestApp, etatCivilHeaders } from './utils/test-app';

describe('Campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const create = (body: object, headers = etatCivilHeaders()) =>
    request(app.getHttpServer())
      .post('/campaigns')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ text: 'Fermeture exceptionnelle des bureaux', ...body });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => cleanDatabase(app));

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('creates one INFO SMS per recipient and reserves the quota', async () => {
    const res = await create({ recipients: ['0150000000', '0140000000', '0190000000'] }).expect(202);
    expect(res.body).toEqual({ id: expect.any(String), recipientCount: 3, segmentsPerSms: 1, totalSegments: 3, status: 'pending' });
    expect(await prisma.sms.count({ where: { campaignId: res.body.id, category: 'INFO' } })).toBe(3);

    const view = await request(app.getHttpServer()).get(`/campaigns/${res.body.id}`).set(etatCivilHeaders()).expect(200);
    expect(view.body.recipientCount).toBe(3);
    expect(Object.values(view.body.countsByStatus).reduce((a: number, b) => a + (b as number), 0)).toBe(3);

    const usage = await request(app.getHttpServer()).get('/usage/daily').set(etatCivilHeaders());
    expect(usage.body.used).toBe(3);
  });

  it('rejects more than 500 recipients', async () => {
    const recipients = Array.from({ length: 501 }, (_, i) => `0150${String(i).padStart(6, '0')}`);
    const res = await create({ recipients }).expect(400);
    expect(res.body.code).toBe('TOO_MANY_RECIPIENTS');
  });

  it('rejects the whole campaign when a recipient is invalid', async () => {
    const res = await create({ recipients: ['0150000000', '0170000000'] }).expect(400);
    expect(res.body.code).toBe('INVALID_RECIPIENTS');
    expect(res.body.message).toContain('0170000000');
    expect(await prisma.sms.count()).toBe(0);
  });

  it('rejects the whole campaign when the quota is exceeded', async () => {
    const recipients = Array.from({ length: 6 }, (_, i) => `015000000${i}`);
    const res = await create({ recipients }, courrierHeaders()).expect(429);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(await prisma.sms.count()).toBe(0);
  });

  it('hides the campaigns of another application', async () => {
    const res = await create({ recipients: ['0150000000'] }, courrierHeaders()).expect(202);
    const other = await request(app.getHttpServer()).get(`/campaigns/${res.body.id}`).set(etatCivilHeaders()).expect(404);
    expect(other.body.code).toBe('CAMPAIGN_NOT_FOUND');
    const list = await request(app.getHttpServer()).get('/campaigns').set(etatCivilHeaders()).expect(200);
    expect(list.body.total).toBe(0);
  });
});
