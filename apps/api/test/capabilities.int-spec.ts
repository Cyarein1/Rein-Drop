/**
 * `GET /me/capabilities` (decision 0018) against a REAL PostgreSQL: the server evaluates the shared
 * feature list with its rollout flags and the user's plan. Throwaway user, deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-caps-${randomUUID().slice(0, 8)}`;

describe('Platform capabilities (integration, real database)', () => {
  let prisma: PrismaClient;
  let userId: string;
  const apps: INestApplication<App>[] = [];
  const boot = async (env: Record<string, string> = {}) => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL, ...env }))] }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
    await app.init();
    apps.push(app);
    return app;
  };
  const caps = (app: INestApplication<App>, platform: string) => request(app.getHttpServer()).get('/me/capabilities').query({ platform }).set(DEV_AUTH_HEADER, SUBJECT);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (await prisma.user.create({ data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT } })).id;
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('web is complete; mobile is the companion (no analytics, dashboard or billing); unbuilt Sell is nowhere', async () => {
    const app = await boot();
    const web = (await caps(app, 'web').expect(200)).body;
    const mobile = (await caps(app, 'mobile').expect(200)).body;
    expect(web.platform).toBe('web');
    for (const f of ['analytics', 'home.dashboard', 'billing.checkout', 'billing.manage', 'deals', 'inventory']) expect(web.features[f]).toEqual({ available: true, reason: null });
    for (const f of ['analytics', 'home.dashboard', 'billing.checkout', 'billing.manage']) expect(mobile.features[f]).toEqual({ available: false, reason: 'not_on_platform' });
    for (const f of ['deals', 'hunts.manage', 'hunts.create', 'inventory', 'account.access', 'push']) expect(mobile.features[f].available).toBe(true);
    expect(web.features['sell.workspace']).toEqual({ available: false, reason: 'not_built' });
    expect(mobile.features['sell.workspace']).toEqual({ available: false, reason: 'not_built' });
    // Not a production environment here, so developer tools show (production: development_only).
    expect(mobile.features['dev.tools'].available).toBe(true);
  });

  it('a rollout flag turns a flagged feature on - still subject to the plan', async () => {
    const app = await boot({ FEATURE_FLAGS: 'hunts.hot,sell.workspace' });
    const web = (await caps(app, 'web').expect(200)).body;
    // Free has no Hot Hunts: flag on, entitlement missing.
    expect(web.features['hunts.hot']).toEqual({ available: false, reason: 'not_entitled' });
    // Unbuilt features stay off whatever the flags say.
    expect(web.features['sell.workspace']).toEqual({ available: false, reason: 'not_built' });
  });

  it('validates the platform and requires sign-in', async () => {
    const app = apps[0]!;
    await caps(app, 'desktop').expect(400);
    await request(app.getHttpServer()).get('/me/capabilities').query({ platform: 'web' }).expect(401);
  });
});
