import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { decryptText } from '../src/common/crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, courrierHeaders, createTestApp, etatCivilHeaders } from './utils/test-app';

describe('SMS submission (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const submit = (body: object, headers = etatCivilHeaders(), key: string | null = randomUUID()) => {
    const req = request(app.getHttpServer()).post('/sms').set(headers);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  const info = (overrides: object = {}) => ({
    to: '0150000000',
    text: 'Votre acte de naissance est disponible',
    category: 'INFO',
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => cleanDatabase(app));

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  describe('POST /sms', () => {
    it('accepts a valid INFO SMS', async () => {
      const res = await submit(info({ text: 'é'.repeat(71), reference: 'REF-1' })).expect(202);
      expect(res.body).toEqual({ id: expect.any(String), segments: 2, status: 'pending' });

      const sms = await prisma.sms.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(sms).toMatchObject({ operator: 'MTN', isUnicode: true, length: 71, reference: 'REF-1' });
    });

    it('rejects an invalid phone number', async () => {
      const res = await submit(info({ to: '0250000000' })).expect(400);
      expect(res.body).toEqual({ code: 'INVALID_PHONE_NUMBER', message: expect.any(String) });
    });

    it('rejects an unknown operator prefix', async () => {
      const res = await submit(info({ to: '0170000000' })).expect(422);
      expect(res.body.code).toBe('UNKNOWN_OPERATOR');
    });

    it('rejects a text longer than 6 segments', async () => {
      const res = await submit(info({ text: 'a'.repeat(961) })).expect(400);
      expect(res.body.code).toBe('TEXT_TOO_LONG');
    });

    it('rejects a scheduled OTP', async () => {
      const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
      const res = await submit(info({ category: 'OTP', scheduledAt })).expect(400);
      expect(res.body.code).toBe('OTP_CANNOT_BE_SCHEDULED');
    });

    it('rejects a scheduled date in the past', async () => {
      const scheduledAt = new Date(Date.now() - 3_600_000).toISOString();
      const res = await submit(info({ scheduledAt })).expect(400);
      expect(res.body.code).toBe('INVALID_SCHEDULED_AT');
    });

    it('rejects an invalid body without echoing values', async () => {
      const res = await submit({ to: '0150000000', text: 'Code 123456', category: 'SMS' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('category');
      expect(res.body.message).not.toContain('123456');
    });

    it('never exposes nor stores an OTP in clear text', async () => {
      const res = await submit(info({ category: 'OTP', text: 'Votre code est 482913' })).expect(202);

      const view = await request(app.getHttpServer()).get(`/sms/${res.body.id}`).set(etatCivilHeaders()).expect(200);
      expect(view.body.text).toBeNull();
      expect(JSON.stringify(view.body)).not.toContain('482913');

      const stored = await prisma.sms.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.text).not.toContain('482913');
      expect(decryptText(stored.text as string, process.env.OTP_ENCRYPTION_KEY as string)).toBe('Votre code est 482913');

      const key = await prisma.idempotencyKey.findFirstOrThrow();
      expect(JSON.stringify(key)).not.toContain('482913');
    });
  });

  describe('daily quota', () => {
    it('rejects a submission beyond the daily quota (COURRIER = 5 segments)', async () => {
      for (let i = 0; i < 5; i++) await submit(info(), courrierHeaders()).expect(202);
      const res = await submit(info(), courrierHeaders()).expect(429);
      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(await prisma.sms.count()).toBe(5);
    });

    it('counts segments, not messages', async () => {
      await submit(info({ text: 'a'.repeat(161 * 2) }), courrierHeaders()).expect(202); // 3 segments
      await submit(info({ text: 'a'.repeat(320) }), courrierHeaders()).expect(202); // 2 segments
      await submit(info({ text: 'a' }), courrierHeaders()).expect(429);
    });

    it('handles concurrent submissions without exceeding the quota', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => submit(info(), courrierHeaders())),
      );
      expect(responses.filter((r) => r.status === 202)).toHaveLength(5);
      expect(responses.filter((r) => r.status === 429)).toHaveLength(5);
    });

    it('reports the daily usage', async () => {
      await submit(info({ text: 'a'.repeat(161) }), courrierHeaders()).expect(202);
      const res = await request(app.getHttpServer()).get('/usage/daily').set(courrierHeaders()).expect(200);
      expect(res.body).toEqual({ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), quota: 5, used: 2, remaining: 3 });
    });
  });

  describe('idempotency', () => {
    it('requires the Idempotency-Key header', async () => {
      const res = await submit(info(), etatCivilHeaders(), null).expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('replays the original response for the same key and body', async () => {
      const key = randomUUID();
      const first = await submit(info(), etatCivilHeaders(), key).expect(202);
      const second = await submit(info(), etatCivilHeaders(), key).expect(202);
      expect(second.body).toEqual(first.body);
      expect(await prisma.sms.count()).toBe(1);
    });

    it('rejects the same key with a different body', async () => {
      const key = randomUUID();
      await submit(info(), etatCivilHeaders(), key).expect(202);
      const res = await submit(info({ text: 'Autre message' }), etatCivilHeaders(), key).expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('releases the key when the request fails', async () => {
      const key = randomUUID();
      await submit(info({ to: '0170000000' }), etatCivilHeaders(), key).expect(422);
      await submit(info(), etatCivilHeaders(), key).expect(202);
    });

    it('scopes keys per application', async () => {
      const key = randomUUID();
      await submit(info(), etatCivilHeaders(), key).expect(202);
      await submit(info(), courrierHeaders(), key).expect(202);
      expect(await prisma.sms.count()).toBe(2);
    });
  });

  describe('GET /sms', () => {
    it('hides the SMS of another application', async () => {
      const res = await submit(info(), courrierHeaders()).expect(202);
      const other = await request(app.getHttpServer()).get(`/sms/${res.body.id}`).set(etatCivilHeaders()).expect(404);
      expect(other.body.code).toBe('SMS_NOT_FOUND');
      await request(app.getHttpServer()).get(`/sms/${res.body.id}`).set(courrierHeaders()).expect(200);
    });

    it('returns 404 for a malformed id', async () => {
      const res = await request(app.getHttpServer()).get('/sms/not-a-uuid').set(etatCivilHeaders()).expect(404);
      expect(res.body.code).toBe('SMS_NOT_FOUND');
    });

    it('lists only the SMS of the caller, with filters and pagination', async () => {
      await submit(info(), etatCivilHeaders()).expect(202);
      await submit(info({ category: 'OTP', text: 'Code 111111' }), etatCivilHeaders()).expect(202);
      await submit(info(), courrierHeaders()).expect(202);

      const all = await request(app.getHttpServer()).get('/sms').set(etatCivilHeaders()).expect(200);
      expect(all.body).toMatchObject({ page: 1, limit: 20, total: 2 });

      const otp = await request(app.getHttpServer())
        .get('/sms?category=OTP&limit=1')
        .set(etatCivilHeaders())
        .expect(200);
      expect(otp.body.total).toBe(1);
      expect(otp.body.items[0]).toMatchObject({ category: 'OTP', text: null });
    });

    it('rejects an invalid pagination', async () => {
      const res = await request(app.getHttpServer()).get('/sms?limit=500').set(etatCivilHeaders()).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
