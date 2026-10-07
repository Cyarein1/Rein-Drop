/**
 * Hunt activity (monitoring state + performance counts) against a REAL PostgreSQL.
 * Throwaway users, hunts, listings and matches - deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type HuntActivity } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const OTHER = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-activity-${randomUUID().slice(0, 8)}-`;

describe('Hunt activity (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let otherId: string;
  let market: Record<'ebay' | 'facebook', string>;
  let scanning: string;
  let watching: string;
  let paused: string;
  const as = (req: request.Test, subject = SUBJECT) => req.set(DEV_AUTH_HEADER, subject);
  const now = Date.now();

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (s: string) => prisma.user.create({ data: { email: `${s}@reindrop.test`, authProvider: 'dev', authSubject: s } });
    userId = (await user(SUBJECT)).id;
    otherId = (await user(OTHER)).id;
    market = Object.fromEntries((await prisma.marketplace.findMany()).map((m) => [m.key, m.id])) as typeof market;
    const hunt = async (status: 'LIVE' | 'PAUSED', polls: { ebay?: object; facebook?: object }) =>
      (
        await prisma.hunt.create({
          data: {
            userId,
            name: status,
            query: 'iPhone 13',
            status,
            marketplaces: { create: Object.entries(polls).map(([k, p]) => ({ marketplaceId: market[k as 'ebay'], ...p })) },
          },
        })
      ).id;
    // Just went live: Facebook checked, eBay not yet -> still scanning.
    scanning = await hunt('LIVE', { ebay: {}, facebook: { lastPolledAt: new Date(now - 60_000), lastPollStatus: 'SUCCEEDED' } });
    watching = await hunt('LIVE', {
      ebay: { lastPolledAt: new Date(now - 5 * 60_000), lastPollStatus: 'SUCCEEDED', nextPollAt: new Date(now + 10 * 60_000) },
      facebook: { lastPolledAt: new Date(now - 2 * 60_000), lastPollStatus: 'FAILED', consecutiveFailures: 3, lastPollError: 'rate limited' },
    });
    paused = await hunt('PAUSED', { ebay: { lastPolledAt: new Date(now - 86_400_000), lastPollStatus: 'SUCCEEDED', nextPollAt: new Date(now) } });

    // Matches for "watching": 2 new (1 of them saved), 1 seen, 1 on a sold listing, 1 bought, 1 ignored, 1 expired.
    const match = async (status: 'NEW' | 'SEEN' | 'BOUGHT' | 'DISMISSED' | 'EXPIRED', listingStatus: 'ACTIVE' | 'SOLD' = 'ACTIVE') => {
      const listing = await prisma.listing.create({
        data: { marketplaceId: market.ebay, externalId: `${PREFIX}${randomUUID().slice(0, 8)}`, url: 'https://example.com/x', title: 'iPhone 13', status: listingStatus, imageUrls: [] },
      });
      return prisma.huntMatch.create({ data: { huntId: watching, listingId: listing.id, status } });
    };
    const saved = await match('NEW');
    await match('NEW');
    await match('SEEN');
    await match('NEW', 'SOLD');
    await match('BOUGHT');
    await match('DISMISSED');
    await match('EXPIRED');
    await prisma.savedDeal.create({ data: { userId, listingId: saved.listingId, huntMatchId: saved.id } });
    await prisma.alert.create({ data: { userId, huntId: watching, huntMatchId: saved.id, category: 'deal_alerts', dedupeKey: `int-test:${randomUUID()}`, title: 'Strong deal' } });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [userId, otherId]) if (id) await prisma.user.delete({ where: { id } });
    await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('a just-activated hunt is scanning until every marketplace has been checked once', async () => {
    const a = (await as(request(app.getHttpServer()).get(`/hunts/${scanning}/activity`)).expect(200)).body as HuntActivity;
    expect(a).toMatchObject({ huntId: scanning, scanning: true, counts: { deals: 0, toReview: 0, alerts: 0 } });
    expect(a.marketplaces.map((m) => [m.marketplace, m.lastCheck])).toEqual([
      ['ebay', null],
      ['facebook', 'ok'],
    ]);
  });

  it('last checked per marketplace, failing streaks and simple performance counts', async () => {
    const a = (await as(request(app.getHttpServer()).get(`/hunts/${watching}/activity`)).expect(200)).body as HuntActivity;
    expect(a).toMatchObject({
      scanning: false,
      lastCheckedAt: new Date(now - 2 * 60_000).toISOString(),
      counts: { deals: 6, toReview: 3, new: 2, alerts: 1, saved: 1, bought: 1 },
    });
    expect(a.marketplaces).toEqual([
      { marketplace: 'ebay', lastCheckedAt: new Date(now - 5 * 60_000).toISOString(), lastCheck: 'ok', failingChecks: 0, nextCheckAt: new Date(now + 10 * 60_000).toISOString() },
      { marketplace: 'facebook', lastCheckedAt: new Date(now - 2 * 60_000).toISOString(), lastCheck: 'failed', failingChecks: 3, nextCheckAt: null },
    ]);
  });

  it('all hunts at once; paused hunts have no next check and are never "scanning"; others are 404', async () => {
    const all = (await as(request(app.getHttpServer()).get('/hunts/activity')).expect(200)).body as { items: HuntActivity[] };
    expect(all.items.map((a) => a.huntId).sort()).toEqual([scanning, watching, paused].sort());
    expect(all.items.find((a) => a.huntId === paused)).toMatchObject({ scanning: false, marketplaces: [{ marketplace: 'ebay', nextCheckAt: null }] });
    await as(request(app.getHttpServer()).get(`/hunts/${watching}/activity`), OTHER).expect(404);
    expect((await as(request(app.getHttpServer()).get('/hunts/activity'), OTHER).expect(200)).body).toEqual({ items: [] });
  });
});
