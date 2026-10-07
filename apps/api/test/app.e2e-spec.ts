import { Test, TestingModule } from '@nestjs/testing';
import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { DEV_AUTH_HEADER, DEV_AUTH_SUBJECT } from '@rein-drop/contracts';
import { AppModule } from './../src/app.module.js';
import { Public } from './../src/auth/decorators.js';
import { createZodDto } from './../src/common/validation/zod-validation.pipe.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { PRISMA } from './../src/database/database.module.js';

// Test-only routes to exercise global validation and error handling end to end.
class EchoDto extends createZodDto(z.object({ name: z.string().min(1) })) {}

@Public()
@Controller('__test')
class TestController {
  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }

  @Post('boom')
  boom(): never {
    throw new Error('secret internal detail');
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

const DEV_USER = { id: '01990000-0000-7000-8000-000000000001', email: 'dev@reindrop.local', displayName: null };

// Fake Prisma: the seeded dev user exists; the database health query fails (DB "down").
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { authProvider_authSubject: { authSubject: string } } }) =>
      where.authProvider_authSubject.authSubject === DEV_AUTH_SUBJECT ? DEV_USER : null,
  },
  $queryRaw: () => Promise.reject(new Error('ECONNREFUSED')),
  $disconnect: async () => undefined,
};

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const config = loadApiConfig({ NODE_ENV: 'test' });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule.forRoot(config), TestModule],
    })
      .overrideProvider(PRISMA)
      .useValue(fakePrisma)
      .compile();

    app = moduleFixture.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public routes', () => {
    it('GET /health -> 200 ok without credentials, with a request id header', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'api' });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('echoes a valid incoming x-request-id', async () => {
      const res = await request(app.getHttpServer()).get('/health').set('x-request-id', 'trace-1');
      expect(res.headers['x-request-id']).toBe('trace-1');
    });

    it('GET /ready -> 503 not_ready when the database is unreachable', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(res.body).toMatchObject({ status: 'not_ready', checks: { database: 'down' } });
    });
  });

  describe('auth boundary (development provider)', () => {
    it('GET /me without credentials -> 401 UNAUTHORIZED in the standard error shape', async () => {
      const res = await request(app.getHttpServer()).get('/me').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', path: '/me' });
    });

    it('GET /me with an unknown dev subject -> 401', async () => {
      const res = await request(app.getHttpServer()).get('/me').set(DEV_AUTH_HEADER, 'nobody').expect(401);
      expect(res.body.message).toMatch(/pnpm db:seed/);
    });

    it('GET /me as the seeded dev user -> 200 AccountIdentity', async () => {
      const res = await request(app.getHttpServer()).get('/me').set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT).expect(200);
      expect(res.body).toEqual({ userId: DEV_USER.id, email: DEV_USER.email, displayName: null });
    });

    it('unknown routes are still 404 (not 401) once authenticated', async () => {
      await request(app.getHttpServer()).get('/nope').set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT).expect(404);
    });
  });

  describe('errors and validation', () => {
    it('unknown route -> 404 in the standard error shape', async () => {
      const res = await request(app.getHttpServer()).get('/nope?token=abc').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: '/nope' });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('valid body passes global validation (unknown keys stripped)', async () => {
      const res = await request(app.getHttpServer())
        .post('/__test/echo')
        .send({ name: 'Ada', extra: 1 })
        .expect(201);
      expect(res.body).toEqual({ name: 'Ada' });
    });

    it('invalid body -> 400 VALIDATION_FAILED with field details', async () => {
      const res = await request(app.getHttpServer()).post('/__test/echo').send({}).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ path: 'body.name' }] });
    });

    it('malformed JSON -> 400 BAD_REQUEST', async () => {
      const res = await request(app.getHttpServer())
        .post('/__test/echo')
        .set('content-type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body).toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('unexpected error -> 500 INTERNAL_ERROR without leaking the message', async () => {
      const res = await request(app.getHttpServer()).post('/__test/boom').expect(500);
      expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });
  });
});
