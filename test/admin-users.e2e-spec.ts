import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp, loginHeaders, rootHeaders } from './utils/test-app';

describe('Dashboard administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let root: Record<string, string>;
  let etatCivilId: string;
  let courrierId: string;

  const http = () => request(app.getHttpServer());

  const createAppAdmin = async (applicationIds: string[]) => {
    const email = `admin-${randomUUID()}@test.bj`;
    const res = await http().post('/admin/users').set(root).send({ email, password: 'Initial-pass-1', applicationIds }).expect(201);
    return { id: res.body.id as string, headers: await loginHeaders(app, email, 'Initial-pass-1') };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    etatCivilId = (await prisma.application.findUniqueOrThrow({ where: { code: 'ETATCIVIL' } })).id;
    courrierId = (await prisma.application.findUniqueOrThrow({ where: { code: 'COURRIER' } })).id;
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    root = await rootHeaders(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('lets the root create an application, returning its API key once', async () => {
    const res = await http()
      .post('/admin/applications')
      .set(root)
      .send({ code: 'IMPOTS', name: 'Impots', dailyQuota: 50 })
      .expect(201);
    expect(res.body).toMatchObject({ code: 'IMPOTS', status: 'active', apiKey: expect.any(String), webhookSecret: null });

    const sms = await http()
      .post('/sms')
      .set({ 'X-App-Code': 'IMPOTS', 'X-Api-Key': res.body.apiKey, 'Idempotency-Key': randomUUID() })
      .send({ to: '0150000000', text: 'Avis', category: 'OTP' })
      .expect(202);
    expect(sms.body.status).toBe('pending');

    await http().post('/admin/applications').set(root).send({ code: 'IMPOTS', name: 'x', dailyQuota: 1 }).expect(409);
  });

  it('suspends an application with a status history', async () => {
    const created = await http().post('/admin/applications').set(root).send({ code: 'DOUANE', name: 'Douane', dailyQuota: 5 }).expect(201);
    const res = await http()
      .patch(`/admin/applications/${created.body.id}/status`)
      .set(root)
      .send({ status: 'suspended', reason: 'Abuse' })
      .expect(200);
    expect(res.body.status).toBe('suspended');
    expect(res.body.history.map((h: { status: string }) => h.status)).toEqual(['suspended', 'active']);

    await http()
      .post('/sms')
      .set({ 'X-App-Code': 'DOUANE', 'X-Api-Key': created.body.apiKey, 'Idempotency-Key': randomUUID() })
      .send({ to: '0150000000', text: 'x', category: 'OTP' })
      .expect(401);
  });

  it('restricts an application admin to its own applications', async () => {
    const admin = await createAppAdmin([etatCivilId]);

    const apps = await http().get('/admin/applications').set(admin.headers).expect(200);
    expect(apps.body.map((a: { code: string }) => a.code)).toEqual(['ETATCIVIL']);

    const sent = await http()
      .post(`/admin/applications/${etatCivilId}/sms`)
      .set(admin.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ to: '0150000000', text: 'Test depuis le dashboard', category: 'OTP' })
      .expect(202);
    await http().get(`/admin/applications/${etatCivilId}/sms/${sent.body.id}`).set(admin.headers).expect(200);

    const campaign = await http()
      .post(`/admin/applications/${etatCivilId}/campaigns`)
      .set(admin.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ recipients: ['0150000000', '0140000000'], text: 'Campagne test' })
      .expect(202);
    expect(campaign.body.recipientCount).toBe(2);

    const other = await http().get(`/admin/applications/${courrierId}/sms`).set(admin.headers).expect(404);
    expect(other.body.code).toBe('APPLICATION_NOT_FOUND');
    await http().get('/admin/stats').set(admin.headers).expect(403);
    await http().get('/admin/users').set(admin.headers).expect(403);
    await http()
      .post('/admin/users')
      .set(admin.headers)
      .send({ email: 'x@test.bj', password: 'Initial-pass-1', applicationIds: [] })
      .expect(403);
  });

  it('lets the root reassign and disable an application admin', async () => {
    const admin = await createAppAdmin([etatCivilId]);

    await http().put(`/admin/users/${admin.id}/applications`).set(root).send({ applicationIds: [courrierId] }).expect(200);
    await http().get(`/admin/applications/${courrierId}/sms`).set(admin.headers).expect(200);
    await http().get(`/admin/applications/${etatCivilId}/sms`).set(admin.headers).expect(404);

    await http().patch(`/admin/users/${admin.id}/status`).set(root).send({ status: 'disabled' }).expect(200);
    await http().get('/auth/me').set(admin.headers).expect(401);
  });

  it('rejects a duplicated email', async () => {
    const email = 'dup@test.bj';
    await http().post('/admin/users').set(root).send({ email, password: 'Initial-pass-1', applicationIds: [] }).expect(201);
    const res = await http().post('/admin/users').set(root).send({ email, password: 'Initial-pass-1', applicationIds: [] }).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });
});
