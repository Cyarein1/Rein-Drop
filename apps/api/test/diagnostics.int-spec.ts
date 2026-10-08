/**
 * Ingestion diagnostics against a REAL PostgreSQL: requests, listings, duplicates, candidates,
 * analyses, alerts, latency percentiles, listing age at discovery and cost - per source and in
 * total - all from SQL aggregates over an explicit test window.
 * Run with `pnpm --filter api test:int`. Uses a throwaway marketplace (never ebay / facebook, so no
 * shared MarketplaceHealth rows) and a 2021 window nobody else writes into; deletes everything after.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type IngestionDiagnostics } from '@rein-drop/contracts';
import { createPrismaClient, type Prisma, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-diag-${randomUUID().slice(0, 8)}-`;
const MARKET = `${PREFIX}market`;
const SINCE = '2021-02-01T00:00:00.000Z';
const UNTIL = '2021-02-03T00:00:00.000Z'; // 2 days
const at = (iso: string, plusMs = 0) => new Date(new Date(iso).getTime() + plusMs);
const MIN = 60_000;

describe('Ingestion diagnostics (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let marketplaceId: string;
  const hunt = { h1: '', h2: '' };

  const get = async (query: string, expected = 200) =>
    (await request(app.getHttpServer()).get(`/dev/diagnostics/ingestion${query}`).set(DEV_AUTH_HEADER, SUBJECT).expect(expected)).body as IngestionDiagnostics;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (await prisma.user.create({ data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT } })).id;
    marketplaceId = (await prisma.marketplace.create({ data: { key: MARKET, name: 'Diagnostics test source' } })).id;
    // No HuntMarketplace rows: a running worker never schedules these Hunts.
    hunt.h1 = (await prisma.hunt.create({ data: { userId, name: 'Switch', query: 'Switch', status: 'PAUSED' } })).id;
    hunt.h2 = (await prisma.hunt.create({ data: { userId, name: 'Lens', query: 'Lens', status: 'PAUSED' } })).id;

    const run = (o: Partial<Prisma.SearchRunUncheckedCreateInput> & { provider: string; huntIds: string[]; startedAt: Date }) =>
      prisma.searchRun.create({ data: { jobId: `${PREFIX}${randomUUID()}`, marketplaceId, groupKey: 'g', criteria: {}, status: 'SUCCEEDED', ...o } });

    // Paid source: a grouped run (2 Hunts) and a failed run that still spent money.
    const runA = await run({
      provider: 'p-cost',
      huntIds: [hunt.h1, hunt.h2],
      startedAt: at('2021-02-01T10:00:00Z'),
      finishedAt: at('2021-02-01T10:00:00Z', 2000),
      pagesFetched: 1,
      resultCount: 20,
      newListingCount: 8,
      updatedListingCount: 12,
      duplicateCount: 1,
      unreadableCount: 1,
      matchedCount: 4,
      newMatchCount: 3,
      rejectedCount: 6,
      rejectionSummary: { price: 4, relevance: 2 },
      sourceUsage: { requests: 1, items: 20, durationMs: 1500, costUsd: 0.052, costIsEstimate: true, details: {} },
      requestLatencyMs: 1600,
    });
    await run({
      provider: 'p-cost',
      huntIds: [hunt.h1],
      status: 'FAILED',
      startedAt: at('2021-02-01T11:00:00Z'),
      finishedAt: at('2021-02-01T11:00:00Z', 5000),
      sourceUsage: { requests: 1, items: 0, durationMs: null, costUsd: 0.01, costIsEstimate: true, details: {} },
      requestLatencyMs: 4000,
    });
    // Free source without usage: requests fall back to pages fetched; cost unknown.
    const runC = await run({
      provider: 'p-free',
      huntIds: [hunt.h2],
      startedAt: at('2021-02-02T09:00:00Z'),
      finishedAt: at('2021-02-02T09:00:00Z', 1000),
      pagesFetched: 2,
      resultCount: 5,
      newListingCount: 5,
    });
    // Outside the window: never counted.
    await run({ provider: 'p-cost', huntIds: [hunt.h1], startedAt: at('2021-01-15T00:00:00Z'), resultCount: 99, sourceUsage: { requests: 9, items: 99, durationMs: null, costUsd: 9, costIsEstimate: false, details: {} } });

    const listing = async (name: string, runId: string, firstSeenAt: Date, postedAgoMs: number | null) => {
      const l = await prisma.listing.create({
        data: {
          marketplaceId,
          externalId: `${PREFIX}${name}`,
          url: `https://dev.example/${name}`,
          title: name,
          imageUrls: [],
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          listedAt: postedAgoMs === null ? null : new Date(firstSeenAt.getTime() - postedAgoMs),
        },
      });
      await prisma.rawListing.create({ data: { marketplaceId, provider: 'raw', searchRunId: runId, externalId: l.externalId, payload: {}, status: 'NORMALIZED', fetchedAt: firstSeenAt, listingId: l.id } });
      return l.id;
    };
    const l1 = await listing('posted-10-min', runA.id, at('2021-02-01T10:00:01Z'), 10 * MIN);
    const l2 = await listing('no-posted-time', runA.id, at('2021-02-01T10:00:01Z'), null);
    const l3 = await listing('posted-1-h', runC.id, at('2021-02-02T09:00:01Z'), 60 * MIN);

    const match = (huntId: string, listingId: string, firstSearchRunId: string) => prisma.huntMatch.create({ data: { huntId, listingId, firstSearchRunId, reasons: [] } });
    const m1 = await match(hunt.h1, l1, runA.id);
    const m2 = await match(hunt.h2, l2, runA.id);
    const m3 = await match(hunt.h2, l3, runC.id);

    await prisma.dealAnalysis.create({
      data: {
        listingId: l1,
        huntMatchId: m1.id,
        status: 'COMPLETED',
        provider: 'mock',
        alertEligible: true,
        durationMs: 12,
        providerMetadata: { tasks: { extractProduct: { usage: { inputTokens: 100, outputTokens: 20 } }, explainDeal: { usage: null } } },
        createdAt: at('2021-02-01T10:00:05Z'),
      },
    });
    await prisma.dealAnalysis.create({ data: { listingId: l2, huntMatchId: m2.id, status: 'FAILED', provider: 'mock', durationMs: 30, providerMetadata: { tasks: {} }, createdAt: at('2021-02-01T10:00:06Z') } });
    // Outside the window.
    await prisma.dealAnalysis.create({ data: { listingId: l3, huntMatchId: m3.id, status: 'COMPLETED', provider: 'mock', createdAt: at('2021-03-01T00:00:00Z') } });
    await prisma.alert.create({ data: { userId, category: 'deal_alerts', huntId: hunt.h1, huntMatchId: m1.id, dedupeKey: `${PREFIX}a1`, title: 'Deal', createdAt: at('2021-02-01T10:00:07Z') } });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      if (userId) await prisma.user.delete({ where: { id: userId } }); // hunts, matches, alerts
      if (marketplaceId) {
        await prisma.listing.deleteMany({ where: { marketplaceId } }); // analyses
        await prisma.rawListing.deleteMany({ where: { marketplaceId } });
        await prisma.searchRun.deleteMany({ where: { marketplaceId } });
        await prisma.marketplace.delete({ where: { id: marketplaceId } });
      }
      await prisma.$disconnect();
    }
  });

  it('reports each source: requests, listings, duplicates, candidates, analyses, alerts, latency, listing age and cost', async () => {
    const d = await get(`?since=${SINCE}&until=${UNTIL}`);
    expect(d.window).toEqual({ since: SINCE, until: UNTIL, hours: 48 });
    const mine = d.sources.filter((s) => s.marketplace === MARKET);
    expect(mine.map((s) => s.provider)).toEqual(['p-cost', 'p-free']);

    const paid = mine[0]!;
    expect(paid).toMatchObject({
      runs: { total: 2, succeeded: 1, failed: 1, running: 0 },
      requests: 2,
      huntsServed: 2,
      listings: { returned: 20, new: 8, updated: 12, duplicates: 1, unreadable: 1 },
      candidates: { evaluated: 10, matched: 4, newMatches: 3, rejected: 6, rejectionReasons: [{ reason: 'price', count: 4 }, { reason: 'relevance', count: 2 }] },
      analysis: { analyzed: 2, completed: 1, failed: 1, alertEligible: 1, aiProviders: ['mock'], inputTokens: 100, outputTokens: 20, duration: { samples: 2, p50Ms: 21, maxMs: 30 } },
      alerts: 1,
      // Worker-measured request latency (1.6s, 4s) and whole-run time (2s, 5s), interpolated medians.
      latency: { request: { samples: 2, p50Ms: 2800, maxMs: 4000 }, run: { samples: 2, p50Ms: 3500, maxMs: 5000 } },
      // Two listings first seen; only one has a posting time (10 minutes before discovery).
      listingAge: { discovered: 2, withPostedTime: 1, age: { samples: 1, p50Ms: 10 * MIN, maxMs: 10 * MIN } },
    });
    // 0.062 USD: 2 runs, 3 new matches, 1 alert, 2 Hunts over 2 days.
    expect(paid.cost).toEqual({
      providerUsd: 0.062,
      providerIsEstimate: true,
      runsWithKnownCost: 2,
      runsWithUnknownCost: 0,
      aiUsd: null,
      perRunUsd: 0.031,
      perNewMatchUsd: 0.020667,
      perAlertUsd: 0.062,
      perHuntDayUsd: 0.0155,
    });

    const free = mine[1]!;
    expect(free).toMatchObject({
      runs: { total: 1 },
      requests: 2, // no usage reported: pages fetched
      huntsServed: 1,
      listings: { returned: 5, new: 5 },
      analysis: { analyzed: 0, inputTokens: null }, // its analysis is outside the window
      latency: { request: { samples: 0, p50Ms: null } },
      listingAge: { discovered: 1, withPostedTime: 1, age: { p50Ms: 60 * MIN } },
      cost: { providerUsd: null, providerIsEstimate: false, runsWithUnknownCost: 1, perRunUsd: null, perHuntDayUsd: null },
    });
  });

  it('totals every source and splits grouped runs between Hunts', async () => {
    const d = await get(`?since=${SINCE}&until=${UNTIL}`);
    // Nothing else is written into this 2021 window, so the totals are exactly ours.
    expect(d.total).toMatchObject({
      marketplace: 'all',
      provider: 'all',
      runs: { total: 3, succeeded: 2, failed: 1 },
      requests: 4,
      huntsServed: 2,
      listings: { returned: 25, new: 13 },
      candidates: { rejectionReasons: [{ reason: 'price', count: 4 }, { reason: 'relevance', count: 2 }] },
      alerts: 1,
      listingAge: { discovered: 3, withPostedTime: 2 },
      cost: { providerUsd: 0.062, runsWithKnownCost: 2, runsWithUnknownCost: 1, perHuntDayUsd: 0.0155 },
    });
    const mine = d.hunts.filter((h) => h.marketplace === MARKET);
    expect(mine.map((h) => [h.name, h.provider, h.runs, h.costUsd, h.perDayUsd])).toEqual([
      ['Switch', 'p-cost', 2, 0.036, 0.018], // half of the grouped run + the failed run
      ['Lens', 'p-cost', 1, 0.026, 0.013],
      ['Lens', 'p-free', 1, null, null],
    ]);
  });

  it('uses a rolling window by default and validates the query', async () => {
    const d = await get('');
    expect(d.window.hours).toBe(24);
    expect(d.sources.some((s) => s.marketplace === MARKET)).toBe(false); // 2021 is outside the last 24h
    await request(app.getHttpServer()).get('/dev/diagnostics/ingestion?hours=0').set(DEV_AUTH_HEADER, SUBJECT).expect(400);
    await request(app.getHttpServer()).get(`/dev/diagnostics/ingestion?since=${UNTIL}&until=${SINCE}`).set(DEV_AUTH_HEADER, SUBJECT).expect(400);
    await request(app.getHttpServer()).get('/dev/diagnostics/ingestion').expect(401);
  });
});
