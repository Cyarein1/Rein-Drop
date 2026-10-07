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
import { createFakeSellerProfilePrisma } from './../src/modules/seller-profile/fake-prisma.js';

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

// Fake Prisma: the seeded dev user exists, seller profiles live in memory, and the
// database health query fails (DB "down") so /ready is exercised as not ready.
const sellerProfiles = createFakeSellerProfilePrisma();
const fakePrisma = {
  user: {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; authProvider_authSubject?: { authSubject: string } };
    }) => {
      if (where.id) return where.id === DEV_USER.id ? { countryCode: null, currency: null } : null; // locale lookup
      return where.authProvider_authSubject?.authSubject === DEV_AUTH_SUBJECT ? DEV_USER : null;
    },
  },
  sellerProfile: sellerProfiles.sellerProfile,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(fakePrisma),
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
      expect(res.body).toEqual({ userId: DEV_USER.id, email: DEV_USER.email, displayName: null, locale: null });
    });

    it('unknown routes are still 404 (not 401) once authenticated', async () => {
      await request(app.getHttpServer()).get('/nope').set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT).expect(404);
    });
  });

  describe('Seller Snapshot (/me/seller-snapshot)', () => {
    const asDev = (req: request.Test) => req.set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT);

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/me/seller-snapshot').expect(401);
      await request(app.getHttpServer()).patch('/me/seller-snapshot').send({ stage: 'side_income' }).expect(401);
    });

    it('GET returns an empty snapshot before any answers', async () => {
      const res = await asDev(request(app.getHttpServer()).get('/me/seller-snapshot')).expect(200);
      expect(res.body).toMatchObject({
        isReseller: null,
        status: 'not_started',
        categories: [],
        stage: null,
        dealRule: null,
        completedAt: null,
      });
    });

    it('refuses profile answers (409) before "Are you a reseller?" is answered yes', async () => {
      const res = await asDev(request(app.getHttpServer()).patch('/me/seller-snapshot'))
        .send({ categories: ['tools'] })
        .expect(409);
      expect(res.body).toMatchObject({ code: 'CONFLICT' });
    });

    it('PATCH saves answers one at a time and completes after the fifth', async () => {
      const server = app.getHttpServer();
      const gate = await asDev(request(server).patch('/me/seller-snapshot')).send({ isReseller: true }).expect(200);
      expect(gate.body.status).toBe('in_progress');
      await asDev(request(server).patch('/me/seller-snapshot')).send({ categories: ['phones_tablets'] }).expect(200);
      await asDev(request(server).patch('/me/seller-snapshot')).send({ stage: 'side_income' }).expect(200);
      await asDev(request(server).patch('/me/seller-snapshot'))
        .send({ sources: ['facebook_marketplace', 'ebay'] })
        .expect(200);
      await asDev(request(server).patch('/me/seller-snapshot'))
        .send({ dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } } })
        .expect(200);
      const res = await asDev(request(server).patch('/me/seller-snapshot'))
        .send({ improvementGoal: 'stop_checking_marketplaces' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'complete',
        categories: ['phones_tablets'],
        stage: 'side_income',
        sources: ['facebook_marketplace', 'ebay'],
        dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } },
        improvementGoal: 'stop_checking_marketplaces',
      });
      expect(typeof res.body.completedAt).toBe('string');

      const get = await asDev(request(server).get('/me/seller-snapshot')).expect(200);
      expect(get.body).toEqual(res.body);
    });

    it('PUT replaces all five answers; switching the deal rule drops the old target', async () => {
      const res = await asDev(request(app.getHttpServer()).put('/me/seller-snapshot'))
        .send({
          categories: ['gaming', 'other'],
          categoriesOther: 'Retro handhelds',
          stage: 'regular_reseller',
          sources: ['ebay'],
          dealRule: { criterion: 'case_by_case' },
          improvementGoal: 'know_what_to_buy',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        categories: ['gaming', 'other'],
        categoriesOther: 'Retro handhelds',
        dealRule: { criterion: 'case_by_case' },
      });
    });

    it.each([
      ['an unknown option', { stage: 'billionaire' }, 'body.stage'],
      ['an empty multi-select', { categories: [] }, 'body.categories'],
      ['an out-of-range target', { dealRule: { criterion: 'min_margin', targetPercent: 0 } }, 'body.dealRule.targetPercent'],
      ['a zero money target', { dealRule: { criterion: 'max_buy_price', target: { amountMinor: 0, currency: 'USD' } } }, 'body.dealRule.target'],
      ['"Other" text without Other', { sources: ['ebay'], sourcesOther: 'Garage sales' }, 'body.sourcesOther'],
      ['an empty body', {}, 'body'],
    ])('PATCH rejects %s with 400 VALIDATION_FAILED', async (_label, body, path) => {
      const res = await asDev(request(app.getHttpServer()).patch('/me/seller-snapshot')).send(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    });

    it('PUT rejects an incomplete snapshot', async () => {
      const res = await asDev(request(app.getHttpServer()).put('/me/seller-snapshot'))
        .send({ categories: ['tools'] })
        .expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['body.stage', 'body.sources', 'body.dealRule', 'body.improvementGoal']),
      );
    });

    it('ignores unknown fields such as location (geography belongs to Hunts)', async () => {
      const res = await asDev(request(app.getHttpServer()).patch('/me/seller-snapshot'))
        .send({ stage: 'full_time', location: 'Cape Town', radiusKm: 50 })
        .expect(200);
      expect(res.body).not.toHaveProperty('location');
      expect(res.body).not.toHaveProperty('radiusKm');
    });

    it('answering "no" -> not_reseller (coming soon); answers kept and restored on "yes"', async () => {
      const server = app.getHttpServer();
      const no = await asDev(request(server).patch('/me/seller-snapshot')).send({ isReseller: false }).expect(200);
      expect(no.body.status).toBe('not_reseller');
      await asDev(request(server).patch('/me/seller-snapshot')).send({ stage: 'side_income' }).expect(409);
      const yes = await asDev(request(server).patch('/me/seller-snapshot')).send({ isReseller: true }).expect(200);
      expect(yes.body).toMatchObject({ status: 'complete', stage: 'full_time' });
    });
  });

  describe('Hunts (HTTP layer; lifecycle is covered by test/hunts.int-spec.ts)', () => {
    const asDev = (req: request.Test) => req.set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT);

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/hunts').expect(401);
      await request(app.getHttpServer()).post('/hunts').send({ query: 'ps5', marketplaces: ['ebay'] }).expect(401);
    });

    it.each([
      ['no marketplace', { query: 'ps5 slim', marketplaces: [] }, 'body.marketplaces'],
      ['meaningless search terms', { query: '??', marketplaces: ['ebay'] }, 'body.query'],
      ['an unsupported marketplace', { query: 'ps5 slim', marketplaces: ['craigslist'] }, 'body.marketplaces.0'],
      ['an exclusion that hides everything', { query: 'ps5 slim', marketplaces: ['ebay'], exclusions: ['ps5'] }, 'body.exclusions.0'],
      ['a zero max price', { query: 'ps5 slim', marketplaces: ['ebay'], maxPrice: { amountMinor: 0, currency: 'USD' } }, 'body.maxPrice'],
      ['an unknown condition', { query: 'ps5 slim', marketplaces: ['ebay'], conditions: ['mint'] }, 'body.conditions.0'],
      ['a non-NORMAL priority', { query: 'ps5 slim', marketplaces: ['ebay'], priority: 'HOT' }, 'body.priority'],
    ])('POST rejects %s with 400', async (_label, body, path) => {
      const res = await asDev(request(app.getHttpServer()).post('/hunts')).send(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    });

    it('rejects a malformed hunt id with 400', async () => {
      const res = await asDev(request(app.getHttpServer()).get('/hunts/not-a-uuid')).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(['param.id']);
    });

    it('has no DELETE endpoint (hunts are archived, never deleted)', async () => {
      await asDev(request(app.getHttpServer()).delete('/hunts/01990000-0000-7000-8000-000000000001')).expect(404);
    });
  });

  describe('Deals (HTTP layer; behaviour is covered by test/deals.int-spec.ts)', () => {
    const asDev = (req: request.Test) => req.set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT);
    const DEAL = '01990000-0000-7000-8000-000000000001';

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/deals').expect(401);
      await request(app.getHttpServer()).get(`/deals/${DEAL}`).expect(401);
      await request(app.getHttpServer()).post(`/deals/${DEAL}/bought`).send({}).expect(401);
    });

    it.each([
      ['an unknown status filter', '/deals?status=NEW', 'query.status'],
      ['an unknown marketplace', '/deals?marketplace=gumtree', 'query.marketplace'],
      ['a malformed hunt id', '/deals?huntId=abc', 'query.huntId'],
      ['a tampered cursor', '/deals?cursor=bm90LWEtY3Vyc29y', 'query.cursor'],
      ['a malformed deal id', '/deals/not-a-uuid', 'param.id'],
    ])('GET rejects %s with 400', async (_label, url, path) => {
      const res = await asDev(request(app.getHttpServer()).get(url)).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    });

    it.each([
      ['ignore', { reason: 'x'.repeat(201) }, 'body.reason'],
      ['bought', { price: { amountMinor: 0, currency: 'ZAR' } }, 'body.price.amountMinor'],
      ['bought', { purchasedAt: 'yesterday' }, 'body.purchasedAt'],
    ])('POST %s rejects an invalid body with 400', async (action, body, path) => {
      const res = await asDev(request(app.getHttpServer()).post(`/deals/${DEAL}/${action}`)).send(body).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    });
  });

  describe('Notifications (HTTP layer; behaviour is covered by test/notifications.int-spec.ts)', () => {
    const asDev = (req: request.Test) => req.set(DEV_AUTH_HEADER, DEV_AUTH_SUBJECT);

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/alerts').expect(401);
      await request(app.getHttpServer()).get('/me/notification-preferences').expect(401);
      await request(app.getHttpServer()).get('/dev/notifications').expect(401);
    });

    it.each([
      ['an empty change list', { changes: [] }, 'body.changes'],
      ['turning off the in-app inbox for deal alerts', { changes: [{ category: 'deal_alerts', channel: 'IN_APP', enabled: false }] }, 'body.changes.0.channel'],
      ['marketing in the inbox', { changes: [{ category: 'marketing', channel: 'IN_APP', enabled: true }] }, 'body.changes.0.channel'],
      ['an unknown category', { changes: [{ category: 'sms_spam', channel: 'PUSH', enabled: true }] }, 'body.changes.0.category'],
    ])('PATCH preferences rejects %s with 400', async (_label, body, path) => {
      const res = await asDev(request(app.getHttpServer()).patch('/me/notification-preferences')).send(body).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    });

    it('rejects a malformed alert id with 400', async () => {
      await asDev(request(app.getHttpServer()).post('/alerts/nope/read')).expect(400);
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
