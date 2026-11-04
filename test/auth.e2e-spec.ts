import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CurrentPrincipal, Roles } from '../src/auth/auth.decorators';
import { Principal } from '../src/auth/auth.types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, etatCivilHeaders, rootHeaders } from './utils/test-app';

@Controller('test-auth')
class TestAuthController {
  @Roles('APP')
  @Get('app')
  app(@CurrentPrincipal() principal: Principal) {
    return principal;
  }

  @Roles('ROOT')
  @Get('admin')
  admin(@CurrentPrincipal() principal: Principal) {
    return principal;
  }
}

describe('Authentication and RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([TestAuthController]);
  });

  afterAll(() => app.close());

  it('GET /health is public', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('rejects a request without credentials', async () => {
    const res = await request(app.getHttpServer()).get('/test-auth/app').expect(401);
    expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: expect.any(String) });
  });

  it('rejects a wrong API key', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/app')
      .set({ 'X-App-Code': 'ETATCIVIL', 'X-Api-Key': 'wrong' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown application code', async () => {
    await request(app.getHttpServer())
      .get('/test-auth/app')
      .set({ 'X-App-Code': 'UNKNOWN', 'X-Api-Key': 'whatever' })
      .expect(401);
  });

  it('rejects a wrong password or an unknown session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: process.env.ROOT_ADMIN_EMAIL, password: 'wrong' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    await request(app.getHttpServer()).get('/test-auth/admin').set({ Authorization: 'Bearer wrong' }).expect(401);
  });

  it('logs the root admin in and out', async () => {
    const headers = await rootHeaders(app);
    const me = await request(app.getHttpServer()).get('/auth/me').set(headers).expect(200);
    expect(me.body).toMatchObject({ email: process.env.ROOT_ADMIN_EMAIL, role: 'ROOT' });
    await request(app.getHttpServer()).post('/auth/logout').set(headers).expect(204);
    await request(app.getHttpServer()).get('/auth/me').set(headers).expect(401);
  });

  it('authenticates an application', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/app')
      .set(etatCivilHeaders())
      .expect(200);
    expect(res.body).toEqual({
      role: 'APP',
      applicationId: expect.any(String),
      code: 'ETATCIVIL',
    });
  });

  it('rejects a suspended application', async () => {
    const prisma = app.get(PrismaService);
    await prisma.application.update({ where: { code: 'ETATCIVIL' }, data: { status: 'suspended' } });
    try {
      const res = await request(app.getHttpServer())
        .get('/test-auth/app')
        .set(etatCivilHeaders())
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    } finally {
      await prisma.application.update({ where: { code: 'ETATCIVIL' }, data: { status: 'active' } });
    }
  });

  it('forbids an admin on an application route', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/app')
      .set(await rootHeaders(app))
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('forbids an application on an admin route', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/admin')
      .set(etatCivilHeaders())
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for an unknown route', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });
  });
});
