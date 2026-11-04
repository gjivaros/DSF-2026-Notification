import { INestApplication } from '@nestjs/common';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWebhookSignature } from '../src/webhooks/webhooks.service';
import { cleanDatabase, createTestApp, etatCivilHeaders, waitFor } from './utils/test-app';

describe('Client webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;
  let originalUrl: string | null;
  const received: { headers: IncomingHttpHeaders; body: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const application = await prisma.application.findUniqueOrThrow({ where: { code: 'ETATCIVIL' } });
    originalUrl = application.webhookUrl;
    await prisma.application.update({
      where: { code: 'ETATCIVIL' },
      data: { webhookUrl: `http://localhost:${port}/hook` },
    });
  });

  beforeEach(async () => {
    received.length = 0;
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await prisma.application.update({ where: { code: 'ETATCIVIL' }, data: { webhookUrl: originalUrl } });
    await cleanDatabase(app);
    await app.close();
    server.close();
  });

  it('notifies the final status with a valid HMAC signature and without the text', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/sms')
      .set(etatCivilHeaders())
      .set('Idempotency-Key', randomUUID())
      .send({ to: '0150000000', text: 'Votre code est 654321', category: 'OTP', reference: 'R1' })
      .expect(202);

    const hook = await waitFor(async () => received.find((r) => r.body.includes(body.id)));
    const payload = JSON.parse(hook.body);
    expect(payload).toMatchObject({ event: 'sms.status', smsId: body.id, status: 'delivered', reference: 'R1' });
    expect(hook.body).not.toContain('654321');
    expect(payload).not.toHaveProperty('text');

    const { webhookSecret } = await prisma.application.findUniqueOrThrow({ where: { code: 'ETATCIVIL' } });
    const timestamp = Number(hook.headers['x-timestamp']);
    expect(hook.headers['x-signature']).toBe(buildWebhookSignature(timestamp, hook.body, webhookSecret as string));
  });

  it('notifies a cancellation', async () => {
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { body } = await request(app.getHttpServer())
      .post('/sms')
      .set(etatCivilHeaders())
      .set('Idempotency-Key', randomUUID())
      .send({ to: '0150000000', text: 'Plus tard', category: 'INFO', scheduledAt })
      .expect(202);
    await request(app.getHttpServer()).post(`/sms/${body.id}/cancel`).set(etatCivilHeaders()).expect(200);

    const hook = await waitFor(async () => received.find((r) => r.body.includes(body.id)));
    expect(JSON.parse(hook.body).status).toBe('cancelled');
  });

  it('demo sink rejects a wrong signature', async () => {
    const res = await request(app.getHttpServer())
      .post('/simulator/webhook-sink')
      .set({ 'X-App-Code': 'ETATCIVIL', 'X-Timestamp': '1', 'X-Signature': 'sha256=wrong' })
      .send({ smsId: 'x' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });
});
