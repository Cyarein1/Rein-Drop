/**
 * Scheduler -> queue -> runner -> marketplace search -> RawListing / Listing / SearchRun /
 * polling metadata / usage, against a REAL PostgreSQL. Run with `pnpm --filter worker test:int`
 * after `pnpm infra:up`, `pnpm db:migrate` and `pnpm db:seed`.
 *
 * Isolation from a worker you may have running: the test owns a throwaway user, its own queue
 * name, scopes the scheduler to that user, and runs its clock ten years ahead - its hunts are
 * created due at that time (nextPollAt), so they are never due for a real-time worker. Everything it creates is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter, type DevScenario } from '@rein-drop/marketplace-core/adapters';
import { HuntScheduler } from '../src/pipeline/hunt-scheduler.js';
import { HUNT_POLL_USAGE_KEY, MarketplaceSearchHandler } from '../src/pipeline/marketplace-search.handler.js';
import { JobRunner } from '../src/queue/job-runner.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const INTERVAL = 15 * 60_000;
const QUEUE = `int-test-search-${randomUUID()}`;

describe('worker pipeline (integration, real database)', () => {
  let prisma: PrismaClient;
  let t = Date.parse('2036-10-07T10:00:00Z');
  const clock = () => new Date(t);
  const advance = (ms: number) => (t += ms);
  const epoch = new Date(t);

  let userId: string;
  let market: Record<'ebay' | 'facebook', string>;
  let huntA: string;
  let huntB: string;
  let paused: string;

  const registry = (scenarios: { ebay?: DevScenario; facebook?: DevScenario } = {}) =>
    new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR', scenario: scenarios.ebay }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR', scenario: scenarios.facebook }), clock),
    ]);
  const pipeline = (scenarios: { ebay?: DevScenario; facebook?: DevScenario } = {}) => {
    const queue = new PostgresJobQueue(prisma, clock);
    const scheduler = new HuntScheduler(
      prisma,
      queue,
      { pollIntervalMs: INTERVAL, maxAttempts: 3, batchSize: 50, queue: QUEUE, onlyUserIds: [userId] },
      clock,
    );
    const handler = new MarketplaceSearchHandler(prisma, registry(scenarios), { maxPages: 2 }, clock);
    const runner = new JobRunner(queue, [handler], { queue: QUEUE, maxJobs: 10, leaseMs: 60_000 }, clock);
    return { scheduler, runner };
  };
  const pollState = (huntId: string, key: 'ebay' | 'facebook') =>
    prisma.huntMarketplace.findUniqueOrThrow({ where: { huntId_marketplaceId: { huntId, marketplaceId: market[key] } } });
  const runsFor = (huntId: string) => prisma.searchRun.findMany({ where: { huntIds: { has: huntId } }, orderBy: { startedAt: 'asc' } });
  const usage = () => prisma.usageEvent.count({ where: { userId, key: HUNT_POLL_USAGE_KEY } });

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const subject = `int-test-${randomUUID().slice(0, 8)}`;
    userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;

    const hunt = async (data: { status: 'LIVE' | 'DRAFT' | 'PAUSED'; query: string; markets: ('ebay' | 'facebook')[]; conditions?: string[]; maxPriceMinor?: number }) =>
      (
        await prisma.hunt.create({
          data: {
            userId,
            name: data.query,
            query: data.query,
            status: data.status,
            locationText: 'Cape Town',
            radiusKm: 40,
            conditions: data.conditions ?? [],
            maxPriceMinor: data.maxPriceMinor ?? 450_000,
            priceCurrency: 'ZAR',
            // Due at the test clock (2036): a real worker running alongside never claims these hunts.
            marketplaces: { create: data.markets.map((k) => ({ marketplaceId: market[k], nextPollAt: epoch })) },
          },
        })
      ).id;
    huntA = await hunt({ status: 'LIVE', query: 'iPhone 13', markets: ['facebook', 'ebay'] });
    // Same search as A on Facebook (different case/spacing, narrower filters): grouped with A.
    huntB = await hunt({ status: 'LIVE', query: ' iphone 13', markets: ['facebook'], conditions: ['used'], maxPriceMinor: 500_000 });
    await hunt({ status: 'DRAFT', query: 'PS5', markets: ['ebay'] });
    paused = await hunt({ status: 'PAUSED', query: 'Pixel 7', markets: ['ebay'] });
  });

  afterAll(async () => {
    if (prisma && userId) {
      const runs = await prisma.searchRun.findMany({ where: { huntIds: { hasSome: [huntA, huntB] } }, select: { id: true } });
      const runIds = runs.map((r) => r.id);
      const raws = await prisma.rawListing.findMany({ where: { searchRunId: { in: runIds } }, select: { listingId: true } });
      const listingIds = [...new Set(raws.map((r) => r.listingId).filter((id): id is string => id !== null))];
      await prisma.rawListing.deleteMany({ where: { searchRunId: { in: runIds } } });
      await prisma.searchRun.deleteMany({ where: { id: { in: runIds } } });
      // Only listings nothing else references (they are shared across users in general).
      await prisma.listing.deleteMany({ where: { externalId: { startsWith: 'int-test-crosspost-' } } });
      await prisma.listing.deleteMany({ where: { id: { in: listingIds }, rawListings: { none: {} } } });
      await prisma.job.deleteMany({ where: { queue: QUEUE } });
      await prisma.user.delete({ where: { id: userId } }); // cascades hunts, hunt marketplaces, usage
    }
    await prisma?.$disconnect();
  });

  it('claims due LIVE hunts once and groups compatible ones into one job per search', async () => {
    const { scheduler } = pipeline();
    expect(await scheduler.scheduleDue()).toEqual({ claimed: 3, enqueued: 2, duplicates: 0, failed: 0 });
    // Same tick again: nothing is due any more.
    expect(await scheduler.scheduleDue()).toEqual({ claimed: 0, enqueued: 0, duplicates: 0, failed: 0 });

    const jobs = await prisma.job.findMany({ where: { queue: QUEUE } });
    expect(jobs).toHaveLength(2);
    const fb = jobs.find((j) => (j.payload as { marketplace: string }).marketplace === 'facebook')!;
    expect(fb.payload).toMatchObject({
      huntIds: [huntA, huntB].sort(),
      criteria: { query: 'iPhone 13', location: { text: 'Cape Town', radiusKm: 40 }, conditions: [], maxPrice: { amountMinor: 500_000, currency: 'ZAR' } },
    });
    expect((await pollState(huntA, 'facebook')).nextPollAt).toEqual(new Date(t + INTERVAL));
    expect((await pollState(paused, 'ebay')).nextPollAt).toEqual(epoch); // paused hunts are never claimed
  });

  it('runs the searches: raw listings, normalized listings, search runs, polling metadata and usage', async () => {
    const { runner } = pipeline();
    expect(await runner.runOnce()).toMatchObject({ received: 2, outcomes: { completed: 2 } });

    const runs = await prisma.searchRun.findMany({ where: { huntIds: { hasSome: [huntA, huntB] } } });
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run).toMatchObject({ status: 'SUCCEEDED', provider: 'dev', attempts: 1, errorCode: null });
      expect(run.resultCount).toBeGreaterThan(0);
      expect(run.newListingCount + run.updatedListingCount + run.unreadableCount).toBe(run.resultCount);
      const raws = await prisma.rawListing.findMany({ where: { searchRunId: run.id } });
      expect(raws).toHaveLength(run.resultCount);
      expect(raws.every((r) => r.status === 'NORMALIZED' && r.listingId !== null && r.provider === 'dev')).toBe(true);
    }
    const fbRun = runs.find((r) => r.marketplaceId === market.facebook)!;
    expect(fbRun.huntIds.sort()).toEqual([huntA, huntB].sort());

    const listings = await prisma.listing.findMany({ where: { marketplaceId: market.facebook, externalId: { startsWith: 'dev-facebook-iphone13-' } } });
    expect(listings.length).toBe(fbRun.resultCount);
    expect(listings.every((l) => l.currency === null || l.currency === 'ZAR')).toBe(true);

    for (const [hunt, key] of [[huntA, 'facebook'], [huntA, 'ebay'], [huntB, 'facebook']] as const) {
      expect(await pollState(hunt, key)).toMatchObject({ lastPollStatus: 'SUCCEEDED', lastPolledAt: new Date(t), consecutiveFailures: 0 });
    }
    expect(await usage()).toBe(3); // one per hunt per marketplace search
    expect(await prisma.job.count({ where: { queue: QUEUE, status: 'SUCCEEDED' } })).toBe(2);
  });

  it('matches listings to each hunt with its own criteria and persists the reasons', async () => {
    const matchesOf = (huntId: string) =>
      prisma.huntMatch.findMany({ where: { huntId }, include: { listing: true }, orderBy: { listing: { externalId: 'asc' } } });
    const a = await matchesOf(huntA);
    const b = await matchesOf(huntB);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);

    for (const m of [...a, ...b]) {
      expect(m).toMatchObject({ status: 'NEW', matcherVersion: 1, statusReason: null });
      expect(m.listing.title.toLowerCase()).toContain('iphone 13');
      expect(m.relevanceScore).toBe(100);
      const reasons = m.reasons as { check: string; outcome: string }[];
      expect(reasons.map((r) => r.check)).toEqual(['availability', 'marketplace', 'relevance', 'accessory', 'condition', 'geography', 'price', 'exclusions', 'economics']);
      expect(reasons.some((r) => r.outcome === 'fail')).toBe(false);
    }
    // Per-hunt max price (A: R4 500, B: R5 000) even though the grouped search used the widest.
    expect(a.every((m) => m.listing.priceMinor === null || m.listing.priceMinor <= 450_000)).toBe(true);
    expect(b.every((m) => m.listing.priceMinor === null || m.listing.priceMinor <= 500_000)).toBe(true);
    // A accepts any condition (for-parts included); B wants used only.
    expect(a.some((m) => m.listing.externalId.endsWith('-for-parts'))).toBe(true);
    expect(b.some((m) => m.listing.externalId.endsWith('-for-parts'))).toBe(false);
    // Geography: Facebook applied location + radius; the eBay dev source can't do radius.
    const geo = (m: (typeof a)[number]) => (m.reasons as { check: string; code: string }[]).find((r) => r.check === 'geography')!.code;
    expect(new Set(a.filter((m) => m.listing.marketplaceId === market.facebook).map(geo))).toEqual(new Set(['enforced_by_source']));
    expect(new Set(a.filter((m) => m.listing.marketplaceId === market.ebay).map(geo))).toEqual(new Set(['not_checked']));

    const runs = await prisma.searchRun.findMany({ where: { huntIds: { has: huntA } } });
    for (const run of runs) {
      expect(run.matchedCount).toBe(await prisma.huntMatch.count({ where: { firstSearchRunId: run.id } }));
      expect(run.newMatchCount).toBe(run.matchedCount);
    }
    // eBay applied the max price itself; on Facebook the grouped search was wider than hunt A / B.
    const fbRun = runs.find((r) => r.marketplaceId === market.facebook)!;
    expect(fbRun.rejectedCount).toBeGreaterThan(0);
    expect(fbRun.rejectionSummary).toMatchObject({ price: expect.any(Number), condition: expect.any(Number) });
  });

  it('is idempotent when a finished job is delivered again', async () => {
    const before = {
      raws: await prisma.rawListing.count({ where: { searchRun: { huntIds: { has: huntA } } } }),
      listings: await prisma.listing.count({ where: { externalId: { startsWith: 'dev-' } } }),
      usage: await usage(),
    };
    // At-least-once delivery: the same job comes back (e.g. the worker died before acknowledging).
    await prisma.job.updateMany({ where: { queue: QUEUE }, data: { status: 'QUEUED', runAt: new Date(t) } });
    const { runner } = pipeline();
    expect(await runner.runOnce()).toMatchObject({ received: 2, outcomes: { completed: 2 } });

    const runs = await runsFor(huntA);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.attempts === 2 && r.status === 'SUCCEEDED')).toBe(true);
    expect(await prisma.rawListing.count({ where: { searchRun: { huntIds: { has: huntA } } } })).toBe(before.raws);
    expect(await prisma.listing.count({ where: { externalId: { startsWith: 'dev-' } } })).toBe(before.listings);
    expect(await usage()).toBe(before.usage);
  });

  it('polls again in the next window, refreshing listings instead of duplicating them', async () => {
    const listingsBefore = await prisma.listing.count({ where: { externalId: { startsWith: 'dev-' } } });
    advance(INTERVAL);
    const { scheduler, runner } = pipeline();
    expect((await scheduler.scheduleDue()).enqueued).toBe(2);
    await runner.runOnce();
    const runs = await runsFor(huntA);
    expect(runs).toHaveLength(4);
    const latest = runs.slice(-2);
    expect(latest.every((r) => r.newListingCount === 0 && r.updatedListingCount === r.resultCount)).toBe(true);
    expect(await prisma.listing.count({ where: { externalId: { startsWith: 'dev-' } } })).toBe(listingsBefore);
    expect(await usage()).toBe(6);
  });

  it('records a rate-limited search as a failure and retries after the source retryAfter', async () => {
    advance(INTERVAL);
    const limited = pipeline({ facebook: 'rate_limited' });
    await limited.scheduler.scheduleDue();
    expect(await limited.runner.runOnce()).toMatchObject({ received: 2, outcomes: { completed: 1, retried: 1 } });

    expect(await pollState(huntB, 'facebook')).toMatchObject({ lastPollStatus: 'FAILED', lastPollErrorCode: 'RATE_LIMITED', consecutiveFailures: 1 });
    expect(await pollState(huntA, 'ebay')).toMatchObject({ lastPollStatus: 'SUCCEEDED', consecutiveFailures: 0 });
    const retry = await prisma.job.findFirstOrThrow({ where: { queue: QUEUE, status: 'QUEUED' } });
    expect(retry.runAt.getTime()).toBeGreaterThanOrEqual(t + 60_000);
    expect(retry.lastError).toMatch(/RATE_LIMITED/);
    expect((await runsFor(huntB)).at(-1)).toMatchObject({ status: 'FAILED', errorCode: 'RATE_LIMITED' });

    // The source recovers; the retry succeeds and clears the failure streak.
    advance(2 * 60_000);
    expect(await pipeline().runner.runOnce()).toMatchObject({ received: 1, outcomes: { completed: 1 } });
    expect(await pollState(huntB, 'facebook')).toMatchObject({ lastPollStatus: 'SUCCEEDED', consecutiveFailures: 0, lastPollErrorCode: null });
    expect((await runsFor(huntB)).at(-1)).toMatchObject({ status: 'SUCCEEDED', attempts: 2 });
  });

  it('dead-letters a search that retrying cannot fix', async () => {
    advance(INTERVAL);
    const broken = pipeline({ ebay: 'not_configured' });
    await broken.scheduler.scheduleDue();
    expect(await broken.runner.runOnce()).toMatchObject({ outcomes: { completed: 1, dead: 1 } });
    expect(await prisma.job.count({ where: { queue: QUEUE, status: 'DEAD' } })).toBe(1);
    expect(await pollState(huntA, 'ebay')).toMatchObject({ lastPollStatus: 'FAILED', lastPollErrorCode: 'NOT_CONFIGURED' });
  });

  it('keeps unreadable payloads as FAILED raw records without failing the search', async () => {
    advance(INTERVAL);
    const messy = pipeline({ facebook: 'malformed_payloads' });
    await messy.scheduler.scheduleDue();
    await messy.runner.runOnce();
    const run = (await runsFor(huntB)).at(-1)!;
    expect(run.status).toBe('SUCCEEDED');
    expect(run.unreadableCount).toBeGreaterThan(0);
    const failed = await prisma.rawListing.findMany({ where: { searchRunId: run.id, status: 'FAILED' } });
    expect(failed).toHaveLength(run.unreadableCount);
    expect(failed[0]!.statusReason).toMatch(/development format/);
  });

  it('treats a cross-posted copy of a listing as a duplicate and expires its match', async () => {
    const match = await prisma.huntMatch.findFirstOrThrow({
      // "deal" stays up for hours of test time (fast-selling listings drop out of search results).
      where: { huntId: huntA, status: 'NEW', listing: { marketplaceId: market.facebook, externalId: { endsWith: '-deal' } } },
      include: { listing: true },
    });
    const l = match.listing;
    // The same item, same price and place, seen earlier on eBay under another id.
    const original = await prisma.listing.create({
      data: {
        marketplaceId: market.ebay,
        externalId: `int-test-crosspost-${randomUUID().slice(0, 8)}`,
        url: 'https://dev-listings.reindrop.invalid/int-test',
        title: l.title.split(' ').reverse().join(' '),
        priceMinor: l.priceMinor,
        currency: l.currency,
        locationText: `  ${l.locationText!.toUpperCase()} `,
        imageUrls: [],
        status: 'ACTIVE',
        firstSeenAt: new Date(l.firstSeenAt.getTime() - 60_000),
        dedupeKey: l.dedupeKey,
      },
    });
    expect(l.dedupeKey).not.toBeNull();

    advance(INTERVAL);
    const { scheduler, runner } = pipeline();
    await scheduler.scheduleDue();
    await runner.runOnce();

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).duplicateOfId).toBe(original.id);
    expect(await prisma.huntMatch.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'EXPIRED', statusReason: 'duplicate' });
    expect((await runsFor(huntA)).filter((r) => r.marketplaceId === market.facebook).at(-1)!.duplicateCount).toBeGreaterThan(0);

    // The original sells: the copy becomes the canonical listing again and is matched again.
    await prisma.listing.update({ where: { id: original.id }, data: { status: 'SOLD' } });
    advance(INTERVAL);
    await scheduler.scheduleDue();
    await runner.runOnce();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).duplicateOfId).toBeNull();
    expect(await prisma.huntMatch.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'NEW', statusReason: 'matches_again' });
    await prisma.listing.delete({ where: { id: original.id } });
  });

  it('expires matches that stop matching, never touches dismissed ones, and revives them', async () => {
    // Listings that stay up during the test (fast sellers drop out of search results - TODO(worker): refresh).
    const open = await prisma.huntMatch.findMany({
      where: { huntId: huntA, status: 'NEW', listing: { NOT: [{ externalId: { endsWith: '-just-listed-hot' } }, { externalId: { endsWith: '-auction' } }] } },
    });
    expect(open.length).toBeGreaterThan(1);
    const [dismissed, ...rest] = open;
    await prisma.huntMatch.update({ where: { id: dismissed!.id }, data: { status: 'DISMISSED' } });

    // The user starts ignoring a word every listing mentions (exclusions are not pushed to sources,
    // so the same listings come back and are re-evaluated).
    await prisma.hunt.update({ where: { id: huntA }, data: { exclusions: ['apple'] } });
    advance(INTERVAL);
    const { scheduler, runner } = pipeline();
    await scheduler.scheduleDue();
    await runner.runOnce();
    for (const m of rest) {
      expect(await prisma.huntMatch.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: 'EXPIRED', statusReason: 'exclusions' });
    }
    const stillDismissed = await prisma.huntMatch.findUniqueOrThrow({ where: { id: dismissed!.id } });
    expect(stillDismissed.status).toBe('DISMISSED');
    expect((stillDismissed.reasons as { check: string; outcome: string }[]).find((r) => r.check === 'exclusions')!.outcome).toBe('fail');

    await prisma.hunt.update({ where: { id: huntA }, data: { exclusions: [] } });
    advance(INTERVAL);
    await scheduler.scheduleDue();
    await runner.runOnce();
    for (const m of rest) {
      expect(await prisma.huntMatch.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: 'NEW', statusReason: 'matches_again' });
    }
    expect((await prisma.huntMatch.findUniqueOrThrow({ where: { id: dismissed!.id } })).status).toBe('DISMISSED');
  });

  it('skips a planned search when its hunts were paused before it ran', async () => {
    advance(INTERVAL);
    const { scheduler, runner } = pipeline();
    await scheduler.scheduleDue();
    const runsBefore = (await runsFor(huntA)).length;
    await prisma.hunt.updateMany({ where: { id: { in: [huntA, huntB] } }, data: { status: 'PAUSED' } });
    expect(await runner.runOnce()).toMatchObject({ received: 2, outcomes: { completed: 2 } });
    expect((await runsFor(huntA)).length).toBe(runsBefore);
  });
});
