/**
 * Effective access per product (decision 0018) against a REAL PostgreSQL: GET /me/access for every
 * access state, Source / Sell / Complete, tier limits, suspension, grace, and backend enforcement on
 * Hunt operations. Throwaway users and test plans; all deleted afterwards. Needs migrate + seed.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, ENTITLEMENT_KEYS as K } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient, type SubscriptionStatus } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TAG = `int-access-${randomUUID().slice(0, 8)}`;
const DAY = 24 * 60 * 60_000;
const future = () => new Date(Date.now() + 10 * DAY);

describe('Effective access (integration, real database)', () => {
  let prisma: PrismaClient;
  let app: INestApplication<App>;
  let graceApp: INestApplication<App>;
  const users: string[] = [];
  const plans: Record<'pro' | 'sell' | 'complete', string> = { pro: '', sell: '', complete: '' };

  async function account(sub?: { plan: keyof typeof plans; status: SubscriptionStatus; periodEnd?: Date | null; cancelAtPeriodEnd?: boolean; updatedAgoDays?: number }[]) {
    const subject = `${TAG}-${users.length}`;
    const user = await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } });
    users.push(user.id);
    for (const [i, s] of (sub ?? []).entries()) {
      const created = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plans[s.plan],
          status: s.status,
          provider: 'stripe',
          providerSubscriptionId: `sub_${subject}_${i}`,
          currentPeriodEnd: s.periodEnd === undefined ? future() : s.periodEnd,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
        },
      });
      if (s.updatedAgoDays) await prisma.$executeRaw`UPDATE "Subscription" SET "updatedAt" = ${new Date(Date.now() - s.updatedAgoDays * DAY)} WHERE id = ${created.id}::uuid`;
    }
    const as = (target: INestApplication<App>, req: (r: ReturnType<typeof request>) => request.Test) => req(request(target.getHttpServer())).set(DEV_AUTH_HEADER, subject);
    return { userId: user.id, subject, get: (target = app) => as(target, (r) => r.get('/me/access')), as: (req: (r: ReturnType<typeof request>) => request.Test) => as(app, req) };
  }

  async function testPlan(code: string, family: 'SELL' | 'COMPLETE') {
    const plan = await prisma.plan.create({ data: { code: `${TAG}-${code}`, name: `Test ${code}`, family, isActive: true, sortOrder: 99 } });
    const rows =
      family === 'SELL'
        ? [{ key: K.sellListingsMax, limit: 50 }]
        : [
            { key: K.activeHuntsMax, limit: 25 },
            { key: K.savedHuntsMax, limit: null },
            { key: `${K.marketplacePrefix}ebay`, limit: null },
            { key: `${K.marketplacePrefix}facebook`, limit: null },
            { key: K.sellListingsMax, limit: null },
          ];
    await prisma.entitlement.createMany({ data: rows.map((r) => ({ planId: plan.id, ...r })) });
    return plan.id;
  }

  const boot = async (env: Record<string, string> = {}) => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL, ...env }))] }).compile();
    const a = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
    await a.init();
    return a;
  };

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    plans.pro = (await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } })).id;
    plans.sell = await testPlan('sell', 'SELL');
    plans.complete = await testPlan('complete', 'COMPLETE');
    app = await boot();
    graceApp = await boot({ BILLING_GRACE_DAYS: '3' });
  });

  afterAll(async () => {
    await app?.close();
    await graceApp?.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.plan.deleteMany({ where: { code: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it('no subscription: Source Free with its limits, no Sell; nothing billing-sensitive in the response', async () => {
    const a = await account();
    const res = await a.get().expect(200);
    expect(res.body.suspended).toBe(false);
    expect(res.body.products.source).toMatchObject({ state: 'free', hasAccess: true, paid: false, plan: { code: 'free', family: 'SOURCE' } });
    expect(res.body.products.source.limits).toMatchObject({ activeHunts: { limit: 1, used: 0, remaining: 1 }, savedHunts: { limit: 10, used: 0, remaining: 10 }, marketplaces: ['ebay', 'facebook'] });
    expect(res.body.products.sell).toMatchObject({ state: 'none', hasAccess: false, plan: null, limits: null });
    expect(JSON.stringify(res.body)).not.toMatch(/sub_|cus_|price|stripe|provider/i);
  });

  it.each([
    ['active Pro', [{ plan: 'pro' as const, status: 'ACTIVE' as const }], 'active', true],
    ['trialing Pro', [{ plan: 'pro' as const, status: 'TRIALING' as const }], 'trialing', true],
    ['past due (Stripe retrying)', [{ plan: 'pro' as const, status: 'PAST_DUE' as const }], 'past_due', true],
    ['cancel scheduled, period running - not removed early', [{ plan: 'pro' as const, status: 'ACTIVE' as const, cancelAtPeriodEnd: true }], 'active', true],
  ])('%s: Source paid access with Pro limits', async (_n, subs, state, paid) => {
    const res = await (await account(subs)).get().expect(200);
    expect(res.body.products.source).toMatchObject({ state, hasAccess: true, paid, plan: { code: 'pro' } });
    expect(res.body.products.source.limits.activeHunts.limit).toBe(10);
    if ('cancelAtPeriodEnd' in subs[0]!) expect(res.body.products.source.cancelsAtPeriodEnd).toBe(true);
    expect(res.body.products.sell.hasAccess).toBe(false);
  });

  it.each([
    ['unpaid (retries exhausted)', { status: 'UNPAID' as const }, 'expired'],
    ['canceled', { status: 'CANCELED' as const }, 'canceled'],
    ['expired', { status: 'EXPIRED' as const, periodEnd: new Date(Date.now() - DAY) }, 'expired'],
    ['period ran out', { status: 'ACTIVE' as const, periodEnd: new Date(Date.now() - DAY) }, 'expired'],
    ['scheduled cancellation took effect', { status: 'ACTIVE' as const, periodEnd: new Date(Date.now() - DAY), cancelAtPeriodEnd: true }, 'canceled'],
  ])('%s: paid access ends, back to Free limits (state says why)', async (_n, sub, state) => {
    const res = await (await account([{ plan: 'pro', ...sub }])).get().expect(200);
    expect(res.body.products.source).toMatchObject({ state, hasAccess: true, paid: false, plan: { code: 'free' } });
    expect(res.body.products.source.limits.activeHunts.limit).toBe(1);
  });

  it('grace period (BILLING_GRACE_DAYS=3): unpaid yesterday keeps Pro until the grace ends; a scheduled cancellation gets none', async () => {
    const unpaid = await account([{ plan: 'pro', status: 'UNPAID', updatedAgoDays: 1 }]);
    const res = await unpaid.get(graceApp).expect(200);
    expect(res.body.products.source).toMatchObject({ state: 'grace_period', hasAccess: true, paid: true, plan: { code: 'pro' } });
    expect(Date.parse(res.body.products.source.graceEndsAt)).toBeGreaterThan(Date.now() + DAY);
    // Same account without grace (default policy): expired.
    expect((await unpaid.get(app).expect(200)).body.products.source.state).toBe('expired');
    const cancelled = await account([{ plan: 'pro', status: 'ACTIVE', periodEnd: new Date(Date.now() - DAY), cancelAtPeriodEnd: true }]);
    expect((await cancelled.get(graceApp).expect(200)).body.products.source.state).toBe('canceled');
  });

  it('Source / Sell / Complete: a Sell plan grants Sell only, Complete grants both', async () => {
    const sell = (await (await account([{ plan: 'sell', status: 'ACTIVE' }])).get().expect(200)).body.products;
    expect(sell.sell).toMatchObject({ state: 'active', hasAccess: true, plan: { family: 'SELL' }, limits: { listings: { limit: 50 } } });
    expect(sell.source).toMatchObject({ state: 'free', plan: { code: 'free' } });

    const complete = (await (await account([{ plan: 'complete', status: 'ACTIVE' }])).get().expect(200)).body.products;
    expect(complete.source).toMatchObject({ state: 'active', paid: true, plan: { family: 'COMPLETE' }, limits: { activeHunts: { limit: 25 }, savedHunts: { limit: null } } });
    expect(complete.sell).toMatchObject({ state: 'active', hasAccess: true, limits: { listings: { limit: null } } });

    // Source Pro + Sell together: each product from its own subscription.
    const both = (await (await account([{ plan: 'pro', status: 'ACTIVE' }, { plan: 'sell', status: 'ACTIVE' }])).get().expect(200)).body.products;
    expect([both.source.plan.code, both.sell.plan.family]).toEqual(['pro', 'SELL']);
  });

  it('saved-Hunt limit is enforced on the server (Free: 10); archiving frees a slot; restore respects it', async () => {
    const a = await account();
    const create = (n: number) => a.as((r) => r.post('/hunts').send({ query: `item ${n}`, marketplaces: ['ebay'] }));
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await create(i).expect(201)).body.id);
    const over = await create(10).expect(409);
    expect(over.body).toMatchObject({ code: 'LIMIT_REACHED' });
    expect(over.body.message).not.toMatch(/upgrade/i);
    await a.as((r) => r.post(`/hunts/${ids[0]}/archive`)).expect(200);
    await create(11).expect(201);
    expect((await a.as((r) => r.post(`/hunts/${ids[0]}/restore`)).expect(409)).body.code).toBe('LIMIT_REACHED');
    expect((await a.get().expect(200)).body.products.source.limits.savedHunts).toEqual({ limit: 10, used: 10, remaining: 0 });
  });

  it('suspended account: no access anywhere, protected operations refused, data kept and readable, usage can still be reduced', async () => {
    const a = await account([{ plan: 'complete', status: 'ACTIVE' }]);
    const huntId = (await a.as((r) => r.post('/hunts').send({ query: 'kept hunt', marketplaces: ['ebay'] })).expect(201)).body.id;
    await a.as((r) => r.post(`/hunts/${huntId}/activate`)).expect(200);
    await prisma.user.update({ where: { id: a.userId }, data: { accessSuspendedAt: new Date(), accessSuspendedReason: 'chargeback (test)' } });

    const res = (await a.get().expect(200)).body;
    expect(res.suspended).toBe(true);
    expect(res.products.source).toMatchObject({ state: 'suspended', hasAccess: false, limits: { activeHunts: { limit: 0 }, savedHunts: { limit: 0 } } });
    expect(res.products.sell).toMatchObject({ state: 'suspended', hasAccess: false, limits: null });
    expect(JSON.stringify(res)).not.toContain('chargeback'); // the reason is internal

    expect((await a.as((r) => r.post('/hunts').send({ query: 'new', marketplaces: ['ebay'] })).expect(403)).body.code).toBe('ACCOUNT_SUSPENDED');
    expect((await a.as((r) => r.patch(`/hunts/${huntId}`).send({ name: 'renamed' })).expect(403)).body.code).toBe('ACCOUNT_SUSPENDED');
    await a.as((r) => r.post(`/hunts/${huntId}/pause`)).expect(200); // reducing usage is always allowed
    expect((await a.as((r) => r.post(`/hunts/${huntId}/resume`)).expect(403)).body.code).toBe('ACCOUNT_SUSPENDED');
    // Data kept and readable.
    expect((await a.as((r) => r.get(`/hunts/${huntId}`)).expect(200)).body.name).toBe('kept hunt');
  });

  it('access belongs to the account: the same answer whichever device / session asks', async () => {
    const a = await account([{ plan: 'pro', status: 'ACTIVE' }]);
    const one = (await a.get().expect(200)).body;
    const two = (await a.as((r) => r.get('/me/access').set('user-agent', 'ReinDrop-iOS/1.0')).expect(200)).body;
    expect(two).toEqual(one);
  });
});
