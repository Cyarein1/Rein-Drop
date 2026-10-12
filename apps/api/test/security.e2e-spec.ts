/**
 * Security rules end to end (hardening pass, docs/security/hardening-2026-10.md), against the real
 * Nest app with a fake Prisma (no database needed):
 * - every route is authenticated unless it is on the reviewed public list;
 * - security headers, no framework banner, no CORS for browsers;
 * - body size limit, money bounds -> 400 not 500, no internal error details;
 * - per-user rate limiting (users don't share a budget; the signed webhook is exempt).
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER } from '@rein-drop/contracts';
import { AppModule } from './../src/app.module.js';
import { IS_PUBLIC } from './../src/auth/decorators.js';
import { configureHttp } from './../src/common/http/security.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { PRISMA } from './../src/database/database.module.js';

/** Routes allowed without a user - review any change to this list. */
const PUBLIC_ROUTES = ['GET /health', 'GET /ready', 'POST /billing/webhooks/stripe', 'POST /waitlist'];

const users = new Map([
  ['alice', { id: '01990000-0000-7000-8000-00000000000a', email: 'alice@reindrop.test', displayName: null }],
  ['bob', { id: '01990000-0000-7000-8000-00000000000b', email: 'bob@reindrop.test', displayName: null }],
]);
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id?: string; authProvider_authSubject?: { authSubject: string } } }) => {
      if (where.id) return { countryCode: null, currency: null, distanceUnit: null, language: null, regionSource: null };
      return users.get(where.authProvider_authSubject?.authSubject ?? '') ?? null;
    },
  },
  $queryRaw: () => Promise.reject(new Error('ECONNREFUSED')),
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(fakePrisma),
  $disconnect: async () => undefined,
};

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
}

/** Every controller route registered in the app, with its @Public() status. */
function routesOf(app: INestApplication): Route[] {
  const routes: Route[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const classPublic = Reflect.getMetadata(IS_PUBLIC, controller) === true;
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (sub === undefined || verb === undefined) continue;
        const path = `/${[base, sub].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`;
        routes.push({ method: RequestMethod[verb], path, isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC, handler) === true });
      }
    }
  }
  return routes;
}

describe('Security rules (e2e)', () => {
  let app: INestApplication<App>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const config = loadApiConfig({ NODE_ENV: 'test', RATE_LIMIT_PER_MINUTE: '10' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(PRISMA)
      .useValue(fakePrisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    configureHttp(app, { trustProxyHops: 0 });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('only the reviewed routes are public; every other route answers 401 without credentials', async () => {
    const routes = routesOf(app);
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.filter((r) => r.isPublic).map((r) => `${r.method} ${r.path}`).sort()).toEqual([...PUBLIC_ROUTES].sort());
    for (const route of routes.filter((r) => !r.isPublic)) {
      const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
      const res = await request(server())[route.method.toLowerCase() as 'get'](path).send({});
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });

  it('sets security headers, hides the framework and sends no CORS headers to browsers', async () => {
    const res = await request(server()).get('/health').set('Origin', 'https://evil.example').expect(200);
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(server()).options('/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses oversized bodies (413) and out-of-range money (400), never a 500', async () => {
    const big = { name: 'x'.repeat(150_000) };
    const tooBig = await request(server()).post('/hunts').set(DEV_AUTH_HEADER, 'bob').send(big);
    expect(tooBig.status).toBe(413);
    const money = await request(server())
      .post('/hunts')
      .set(DEV_AUTH_HEADER, 'bob')
      .send({ name: 'Switch', query: 'Switch', marketplaces: ['ebay'], maxPrice: { amountMinor: 9_000_000_000_000, currency: 'ZAR' } });
    expect(money.status).toBe(400);
    expect(money.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('never leaks internal details: database failures are a generic 503 / 500 body', async () => {
    const res = await request(server()).get('/ready');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|stack|prisma/i);
  });

  it('rate-limits per user: one user hitting the limit does not block another, and 429 says RATE_LIMITED', async () => {
    let limited: request.Response | null = null;
    for (let i = 0; i < 12 && !limited; i += 1) {
      const res = await request(server()).get('/me').set(DEV_AUTH_HEADER, 'alice');
      if (res.status === 429) limited = res;
    }
    expect(limited?.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(limited?.headers['retry-after']).toBeDefined();
    await request(server()).get('/me').set(DEV_AUTH_HEADER, 'bob').expect(200);
  });

  it('never rate-limits the signed billing webhook (Stripe bursts and retries)', async () => {
    for (let i = 0; i < 15; i += 1) {
      const res = await request(server()).post('/billing/webhooks/stripe').set('content-type', 'application/json').send('{}');
      expect(res.status).not.toBe(429);
    }
  });
});
