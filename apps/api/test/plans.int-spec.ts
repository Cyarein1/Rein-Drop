/**
 * Plans + entitlements against a REAL PostgreSQL. Needs `pnpm db:seed` (plans).
 * Run with `pnpm --filter api test:int`. Creates a throwaway user / plan and deletes them.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, ENTITLEMENT_KEYS as K } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-plans-${randomUUID().slice(0, 8)}`;
const TEMP_PLAN = `int-ebay-only-${randomUUID().slice(0, 8)}`;

describe('Plans & entitlements (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, SUBJECT);
  const createHunt = async (query: string, marketplaces: string[] = ['ebay']) =>
    (await as(request(app.getHttpServer()).post('/hunts')).send({ query, marketplaces }).expect(201)).body.id as string;
  const subscribe = async (planCode: string) => {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: planCode } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.subscription.create({ data: { userId, planId: plan.id, status: 'ACTIVE' } });
  };

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (
      await prisma.user.create({ data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT } })
    ).id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (userId) await prisma.user.delete({ where: { id: userId } }); // cascades hunts, subscriptions
    await prisma.plan.deleteMany({ where: { code: TEMP_PLAN } });
    await prisma.$disconnect();
  });

  it('lists Free and placeholder paid plans without prices', async () => {
    const res = await as(request(app.getHttpServer()).get('/plans')).expect(200);
    const codes = res.body.items.map((p: { code: string }) => p.code);
    expect(codes.slice(0, 3)).toEqual(['free', 'pro', 'ultimate']);
    expect(codes).not.toContain('dev-free');
    expect(res.body.items[0]).toMatchObject({ pricing: { status: 'free' }, limitsFinal: false });
    expect(res.body.items[1]).toMatchObject({ pricing: { status: 'tbd' }, limitsFinal: false });
    expect(res.body.items[0].entitlements).toMatchObject({
      hotHunts: { available: false },
      monitoringPriority: 'NORMAL',
      seats: 1,
    });
  });

  it('enforces the active-hunt limit, preserves the draft, and reports a structured block', async () => {
    const server = app.getHttpServer();
    const ent = await as(request(server).get('/me/entitlements')).expect(200);
    expect(ent.body).toMatchObject({ plan: { code: 'free' }, usage: { activeHunts: 0 } });
    const freeLimit = ent.body.entitlements.activeHunts.limit as number;
    expect(freeLimit).toBeGreaterThanOrEqual(1);

    const live: string[] = [];
    for (let i = 0; i < freeLimit; i++) {
      const id = await createHunt(`switch oled ${i}`);
      await as(request(server).post(`/hunts/${id}/activate`)).expect(200);
      live.push(id);
    }
    const blockedId = await createHunt('steam deck oled');

    const preview = await as(request(server).get(`/hunts/${blockedId}/activation-check`)).expect(200);
    expect(preview.body).toMatchObject({ canActivate: false, planCode: 'free' });
    expect(preview.body.reasons[0]).toMatchObject({ code: 'ACTIVE_HUNT_LIMIT_REACHED', limit: freeLimit, used: freeLimit });

    const blocked = await as(request(server).post(`/hunts/${blockedId}/activate`)).expect(409);
    expect(blocked.body).toMatchObject({
      code: 'ACTIVATION_BLOCKED',
      activationBlock: {
        planCode: 'free',
        reasons: [
          {
            code: 'ACTIVE_HUNT_LIMIT_REACHED',
            limit: freeLimit,
            used: freeLimit,
            resolutions: ['pause_another_hunt', 'upgrade_plan'],
          },
        ],
      },
    });
    // The draft is preserved untouched, with no activation recorded.
    const draft = await as(request(server).get(`/hunts/${blockedId}`)).expect(200);
    expect(draft.body).toMatchObject({ status: 'DRAFT', activatedAt: null });
    const events = await as(request(server).get(`/hunts/${blockedId}/events`)).expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual(['CREATED']);

    // Pausing another hunt frees a slot.
    await as(request(server).post(`/hunts/${live[0]}/pause`)).expect(200);
    expect((await as(request(server).get(`/hunts/${blockedId}/activation-check`)).expect(200)).body.canActivate).toBe(true);
    await as(request(server).post(`/hunts/${blockedId}/activate`)).expect(200);

    // Resuming is gated too: the paused hunt cannot come back while the plan is full.
    const resume = await as(request(server).post(`/hunts/${live[0]}/resume`)).expect(409);
    expect(resume.body.activationBlock.reasons[0].code).toBe('ACTIVE_HUNT_LIMIT_REACHED');
    expect((await as(request(server).get(`/hunts/${live[0]}`)).expect(200)).body.status).toBe('PAUSED');

    // Upgrading lifts the limit.
    await subscribe('pro');
    const pro = await as(request(server).get('/me/entitlements')).expect(200);
    expect(pro.body.plan.code).toBe('pro');
    await as(request(server).post(`/hunts/${live[0]}/resume`)).expect(200);
  });

  it('blocks marketplaces outside the plan, on activation and on live edits', async () => {
    const server = app.getHttpServer();
    const plan = await prisma.plan.create({
      data: {
        code: TEMP_PLAN,
        name: 'eBay only (test)',
        entitlements: {
          create: [
            { key: K.activeHuntsMax, limit: null },
            { key: `${K.marketplacePrefix}ebay`, limit: null },
            { key: K.monitoringPriority, value: 'NORMAL' },
          ],
        },
      },
    });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.subscription.create({ data: { userId, planId: plan.id, status: 'ACTIVE' } });

    const fbId = (
      await as(request(server).post('/hunts'))
        .send({ query: 'ps5 slim', marketplaces: ['facebook'], location: { text: 'Cape Town', radiusKm: 30 } })
        .expect(201)
    ).body.id as string;
    const blocked = await as(request(server).post(`/hunts/${fbId}/activate`)).expect(409);
    expect(blocked.body.activationBlock.reasons).toEqual([
      expect.objectContaining({ code: 'MARKETPLACE_NOT_IN_PLAN', marketplaces: ['facebook'] }),
    ]);

    const ebayId = await createHunt('xbox series x');
    await as(request(server).post(`/hunts/${ebayId}/activate`)).expect(200);
    const edit = await as(request(server).patch(`/hunts/${ebayId}`))
      .send({ marketplaces: ['ebay', 'facebook'], location: { text: 'Cape Town', radiusKm: 30 } })
      .expect(409);
    expect(edit.body.code).toBe('ACTIVATION_BLOCKED');
    expect((await as(request(server).get(`/hunts/${ebayId}`)).expect(200)).body.marketplaces).toEqual(['ebay']);
  });
});
