/**
 * Source health + degradation against a REAL PostgreSQL: a failing source cools down (per-source
 * backoff) while the other keeps working, its hunts' checks wait instead of queueing doomed
 * searches, a job hitting a cool-down is deferred without using an attempt, partial / slow / timed
 * out searches are not recorded as clean successes, and recovery clears it all.
 *
 * Isolation from a worker you may have running: the pipeline part keeps source health IN MEMORY
 * (the shared MarketplaceHealth rows are never touched) and runs its clock in 2036; the database
 * store is tested against a throwaway Marketplace row. Everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter, type DevScenario } from '@rein-drop/marketplace-core/adapters';
import { DEFAULT_SOURCE_HEALTH_POLICY } from '../src/health/source-health.js';
import { InMemorySourceHealth, SourceHealthStore } from '../src/health/source-health.store.js';
import { HuntScheduler } from '../src/pipeline/hunt-scheduler.js';
import { MarketplaceSearchHandler } from '../src/pipeline/marketplace-search.handler.js';
import { JobRunner } from '../src/queue/job-runner.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const INTERVAL = 15 * 60_000;
const QUEUE = `int-test-health-${randomUUID()}`;

describe('source health (integration, real database)', () => {
  let prisma: PrismaClient;
  let t = Date.parse('2036-11-01T10:00:00Z');
  const clock = () => new Date(t);
  const advance = (ms: number) => (t += ms);
  const epoch = new Date(t);
  let userId: string;
  let market: Record<'ebay' | 'facebook', string>;
  let hunt: string;
  let other: string;
  const health = new InMemorySourceHealth(DEFAULT_SOURCE_HEALTH_POLICY, clock);

  type Sources = { ebay?: DevScenario; facebook?: DevScenario; ebayLatencyMs?: number };
  const pipeline = (s: Sources = {}, opts: { timeoutMs?: number } = {}) => {
    const registry = new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR', scenario: s.ebay, latencyMs: s.ebayLatencyMs }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR', scenario: s.facebook }), clock),
    ]);
    const queue = new PostgresJobQueue(prisma, clock);
    const scheduler = new HuntScheduler(prisma, queue, { pollIntervalMs: INTERVAL, maxAttempts: 3, batchSize: 50, queue: QUEUE, onlyUserIds: [userId], health }, clock);
    const handler = new MarketplaceSearchHandler(prisma, registry, { maxPages: 1, health, searchTimeoutMs: opts.timeoutMs }, clock);
    const runner = new JobRunner(queue, [handler], { queue: QUEUE, maxJobs: 10, leaseMs: 60_000 }, clock);
    return { scheduler, runner };
  };
  const poll = (huntId: string, key: 'ebay' | 'facebook') => prisma.huntMarketplace.findUniqueOrThrow({ where: { huntId_marketplaceId: { huntId, marketplaceId: market[key] } } });
  const jobs = () => prisma.job.findMany({ where: { queue: QUEUE }, orderBy: { createdAt: 'asc' } });
  const ebayJob = async () => (await jobs()).find((j) => (j.payload as { marketplace: string }).marketplace === 'ebay')!;
  const makeHunt = async (query: string, markets: ('ebay' | 'facebook')[]) =>
    (
      await prisma.hunt.create({
        data: {
          userId,
          name: query,
          query,
          status: 'LIVE',
          locationText: 'Cape Town',
          radiusKm: 40,
          // Due at the test clock (2036): a real worker never claims these.
          marketplaces: { create: markets.map((k) => ({ marketplaceId: market[k], nextPollAt: epoch })) },
        },
      })
    ).id;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const subject = `int-test-${randomUUID().slice(0, 8)}`;
    userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;
    hunt = await makeHunt('iPhone 13', ['ebay', 'facebook']);
  });

  afterAll(async () => {
    if (prisma && userId) {
      const runs = await prisma.searchRun.findMany({ where: { job: undefined, huntIds: { has: hunt } }, select: { id: true } });
      const all = await prisma.searchRun.findMany({ where: { jobId: { in: (await jobs()).map((j) => j.id) } }, select: { id: true } });
      const runIds = [...new Set([...runs, ...all].map((r) => r.id))];
      const raws = await prisma.rawListing.findMany({ where: { searchRunId: { in: runIds } }, select: { listingId: true } });
      const listingIds = [...new Set(raws.map((r) => r.listingId).filter((id): id is string => id !== null))];
      await prisma.rawListing.deleteMany({ where: { searchRunId: { in: runIds } } });
      await prisma.searchRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.listing.deleteMany({ where: { id: { in: listingIds }, rawListings: { none: {} } } });
      await prisma.job.deleteMany({ where: { queue: QUEUE } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma?.$disconnect();
  });

  it('one source failing, the other partial: neither is recorded as fully healthy; the failing one cools down', async () => {
    const { scheduler, runner } = pipeline({ ebay: 'unavailable', facebook: 'degraded' });
    expect(await scheduler.scheduleDue()).toMatchObject({ claimed: 2, enqueued: 2, deferred: 0 });
    expect(await runner.runOnce()).toMatchObject({ received: 2, outcomes: { completed: 1, retried: 1 } });

    // Facebook worked, partially: the hunt's check says DEGRADED, not SUCCEEDED.
    expect(await poll(hunt, 'facebook')).toMatchObject({ lastPollStatus: 'DEGRADED', lastPollErrorCode: 'PARTIAL' });
    expect(await health.get(market.facebook)).toMatchObject({ status: 'DEGRADED', reason: 'PARTIAL', retryAfter: null });
    // eBay failed: degraded (not yet down) and cooling down for 30s; the job retries then.
    expect(await poll(hunt, 'ebay')).toMatchObject({ lastPollStatus: 'FAILED', lastPollErrorCode: 'UNAVAILABLE' });
    const ebay = await health.get(market.ebay);
    expect(ebay).toMatchObject({ status: 'DEGRADED', reason: 'UNAVAILABLE', consecutiveFailures: 1, retryAfter: new Date(t + 30_000) });
    expect((await ebayJob()).runAt).toEqual(new Date(t + 30_000));
  });

  it('hunts due on a cooling source wait for it instead of queueing searches', async () => {
    other = await makeHunt('PS5', ['ebay']);
    const { scheduler } = pipeline({ ebay: 'unavailable' });
    const before = (await jobs()).length;
    expect(await scheduler.scheduleDue()).toMatchObject({ claimed: 0, enqueued: 0, deferred: 1 });
    expect((await poll(other, 'ebay')).nextPollAt).toEqual(new Date(t + 30_000));
    expect((await jobs()).length).toBe(before);
  });

  it('repeated failures: down after 3, cool-down doubles each time', async () => {
    const { runner } = pipeline({ ebay: 'unavailable' });
    advance(30_000);
    await runner.runOnce(); // attempt 2
    expect(await health.get(market.ebay)).toMatchObject({ status: 'DEGRADED', consecutiveFailures: 2, retryAfter: new Date(t + 60_000) });
    advance(60_000);
    await runner.runOnce(); // attempt 3 = maxAttempts: dead-lettered, source now down
    expect(await health.get(market.ebay)).toMatchObject({ status: 'DOWN', consecutiveFailures: 3, retryAfter: new Date(t + 120_000) });
    expect((await ebayJob()).status).toBe('DEAD');
  });

  it('a job that reaches a cooling source is deferred without using an attempt', async () => {
    const { scheduler, runner } = pipeline({ ebay: 'normal' });
    // Cool-down over for the scheduler: queue a fresh eBay search...
    advance(120_000);
    expect(await scheduler.scheduleDue()).toMatchObject({ enqueued: 1 });
    // ...but the source fails again elsewhere before it runs (another worker): it cools down again.
    await health.record(market.ebay, 'dev', { kind: 'failure', code: 'UNAVAILABLE', message: 'x', latencyMs: null, retryAfter: null });
    const until = (await health.get(market.ebay))!.retryAfter!;
    expect(await runner.runOnce()).toMatchObject({ outcomes: { deferred: 1 } });
    const deferredJob = (await jobs()).filter((j) => (j.payload as { marketplace: string }).marketplace === 'ebay').at(-1)!;
    expect(deferredJob).toMatchObject({ status: 'QUEUED', attempts: 0, runAt: until });
  });

  it('recovery: the next search succeeds and the source is healthy again', async () => {
    const { runner } = pipeline({ ebay: 'normal' });
    t = (await health.get(market.ebay))!.retryAfter!.getTime();
    expect(await runner.runOnce()).toMatchObject({ outcomes: { completed: 1 } });
    expect(await health.get(market.ebay)).toMatchObject({ status: 'HEALTHY', consecutiveFailures: 0, retryAfter: null });
    // The recovered search was the PS5 hunt's (deferred earlier); its check is a clean success.
    expect(await poll(other, 'ebay')).toMatchObject({ lastPollStatus: 'SUCCEEDED', lastPollErrorCode: null, consecutiveFailures: 0 });
  });

  it('slow searches are degraded; too slow ones time out (retryable) and count as failures', async () => {
    const slowHealth = new InMemorySourceHealth({ ...DEFAULT_SOURCE_HEALTH_POLICY, slowMs: 50 }, clock);
    const run = async (latencyMs: number, timeoutMs?: number) => {
      const registry = new MarketplaceRegistry([new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR', latencyMs })]);
      const handler = new MarketplaceSearchHandler(prisma, registry, { maxPages: 1, health: slowHealth, searchTimeoutMs: timeoutMs }, clock);
      const queue = new PostgresJobQueue(prisma, clock);
      const job = await queue.enqueue({ queue: QUEUE, type: handler.type, payload: { marketplace: 'ebay', groupKey: `slow-${latencyMs}`, huntIds: [hunt], criteria: { query: 'iPhone 13', location: { text: 'Cape Town', radiusKm: 40 }, conditions: [], maxPrice: null } }, maxAttempts: 3, dedupeKey: `slow-${latencyMs}-${t}` });
      const runner = new JobRunner(queue, [handler], { queue: QUEUE, maxJobs: 10, leaseMs: 60_000 }, clock);
      advance(1);
      await runner.runOnce();
      return prisma.job.findUniqueOrThrow({ where: { id: job.jobId } });
    };
    expect(await run(120)).toMatchObject({ status: 'SUCCEEDED' });
    expect(await slowHealth.get(market.ebay)).toMatchObject({ status: 'DEGRADED', reason: 'SLOW' });
    expect(await poll(hunt, 'ebay')).toMatchObject({ lastPollStatus: 'DEGRADED', lastPollErrorCode: 'SLOW' });

    expect(await run(2_000, 100)).toMatchObject({ status: 'QUEUED', lastError: expect.stringContaining('timeout') });
    expect(await slowHealth.get(market.ebay)).toMatchObject({ status: 'DEGRADED', reason: 'UNAVAILABLE', consecutiveFailures: 1 });
  });
});

describe('MarketplaceHealth store (integration, throwaway marketplace)', () => {
  let prisma: PrismaClient;
  let marketplaceId: string;
  const t = Date.parse('2036-11-02T10:00:00Z');

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    // Not a real source key: no worker or screen ever looks at this row.
    marketplaceId = (await prisma.marketplace.create({ data: { key: `int-test-${randomUUID().slice(0, 8)}`, name: 'Int test source', isEnabled: false } })).id;
  });

  afterAll(async () => {
    if (marketplaceId) await prisma.marketplace.delete({ where: { id: marketplaceId } }); // cascades its health row
    await prisma?.$disconnect();
  });

  it('persists transitions and lists cooling sources', async () => {
    const store = new SourceHealthStore(prisma, DEFAULT_SOURCE_HEALTH_POLICY, () => new Date(t));
    const fail = { kind: 'failure' as const, code: 'UNAVAILABLE' as const, message: 'down', latencyMs: 10, retryAfter: null };
    await store.record(marketplaceId, 'dev', fail);
    expect(await store.get(marketplaceId)).toMatchObject({ status: 'DEGRADED', consecutiveFailures: 1, retryAfter: new Date(t + 30_000) });
    expect(await store.coolingDown(new Date(t))).toContainEqual({ marketplaceId, retryAfter: new Date(t + 30_000) });
    await store.record(marketplaceId, 'dev', { kind: 'success', latencyMs: 20, partial: false });
    expect(await prisma.marketplaceHealth.findUniqueOrThrow({ where: { marketplaceId } })).toMatchObject({ status: 'HEALTHY', provider: 'dev', consecutiveFailures: 0, retryAfter: null, lastLatencyMs: 20 });
  });

  it('concurrent outcomes are never lost (row lock)', async () => {
    const store = new SourceHealthStore(prisma, DEFAULT_SOURCE_HEALTH_POLICY, () => new Date(t));
    const fail = { kind: 'failure' as const, code: 'UNAVAILABLE' as const, message: 'down', latencyMs: null, retryAfter: null };
    await Promise.all(Array.from({ length: 6 }, () => store.record(marketplaceId, 'dev', fail)));
    expect(await store.get(marketplaceId)).toMatchObject({ status: 'DOWN', consecutiveFailures: 6 });
  });
});
