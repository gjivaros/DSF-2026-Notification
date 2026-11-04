import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { cleanDatabase, courrierHeaders, createTestApp, etatCivilHeaders, rootHeaders } from './utils/test-app';

describe('Admin dashboard (e2e)', () => {
  let app: INestApplication;

  const submit = (to: string, headers: Record<string, string>) =>
    request(app.getHttpServer())
      .post('/sms')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ to, text: 'Information', category: 'INFO', scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() })
      .expect(202);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => cleanDatabase(app));

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('requires credentials', async () => {
    await request(app.getHttpServer()).get('/admin/stats').expect(401);
  });

  it('forbids applications', async () => {
    const res = await request(app.getHttpServer()).get('/admin/stats').set(etatCivilHeaders()).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns volumes per application, operator and status', async () => {
    await submit('0150000000', etatCivilHeaders());
    await submit('0140000000', etatCivilHeaders());
    await submit('0190000000', courrierHeaders());

    const res = await request(app.getHttpServer()).get('/admin/stats').set(await rootHeaders(app)).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.byApplication).toEqual(
      expect.arrayContaining([
        { code: 'ETATCIVIL', count: 2, segments: 2 },
        { code: 'COURRIER', count: 1, segments: 1 },
      ]),
    );
    expect(res.body.byOperator).toHaveLength(3);
    expect(res.body.byStatus).toEqual([{ status: 'pending', count: 3 }]);

    const apps = await request(app.getHttpServer()).get('/admin/applications').set(await rootHeaders(app)).expect(200);
    expect(apps.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ETATCIVIL', status: 'active', usedToday: 2 })]),
    );
  });
});
