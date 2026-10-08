/**
 * Search -> match -> deal analysis (mock AIProvider + deterministic scoring) -> DealAnalysis,
 * against a REAL PostgreSQL. Same isolation as pipeline.int-spec.ts: throwaway user, own queue
 * names, scheduler scoped to that user, clock ten years ahead; everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { AIProviderError, createMockAIProvider } from '@rein-drop/ai-core';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter } from '@rein-drop/marketplace-core/adapters';
import type { AlertEligibility, DealEconomics, ScoreReason } from '@rein-drop/scoring';
import { ANALYSIS_JOB_TYPE, DealAnalysisHandler } from '../src/pipeline/deal-analysis.handler.js';
import { HuntScheduler } from '../src/pipeline/hunt-scheduler.js';
import { MarketplaceSearchHandler } from '../src/pipeline/marketplace-search.handler.js';
import { JobRunner, RetryableJobError } from '../src/queue/job-runner.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const INTERVAL = 15 * 60_000;
const SEARCH_QUEUE = `int-test-search-${randomUUID()}`;
const ANALYSIS_QUEUE = `int-test-analysis-${randomUUID()}`;

type Scoring = { strengthReasons: ScoreReason[]; confidenceReasons: ScoreReason[]; alert: AlertEligibility };

describe('deal analysis pipeline (integration, real database)', () => {
  let prisma: PrismaClient;
  let t = Date.parse('2036-10-07T10:00:00Z');
  const clock = () => new Date(t);
  const epoch = new Date(t);

  let userId: string;
  let market: Record<'ebay' | 'facebook', string>;
  /** Max price + profit target (like a Seller Snapshot default). */
  let priced: string;
  /** No max price, no target: nothing of the user's own to verify. */
  let open: string;

  const pipeline = () => {
    const queue = new PostgresJobQueue(prisma, clock);
    const registry = new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR' }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR' }), clock),
    ]);
    const scheduler = new HuntScheduler(
      prisma,
      queue,
      { pollIntervalMs: INTERVAL, maxAttempts: 3, batchSize: 50, queue: SEARCH_QUEUE, onlyUserIds: [userId] },
      clock,
    );
    const search = new MarketplaceSearchHandler(prisma, registry, { maxPages: 2, analysis: { queue, queueName: ANALYSIS_QUEUE, maxAttempts: 3 } }, clock);
    const searches = new JobRunner(queue, [search], { queue: SEARCH_QUEUE, maxJobs: 10, leaseMs: 60_000 }, clock);
    const analysis = new DealAnalysisHandler(prisma, createMockAIProvider(), registry, undefined, clock);
    const analyses = new JobRunner(queue, [analysis], { queue: ANALYSIS_QUEUE, maxJobs: 50, leaseMs: 60_000 }, clock);
    return { scheduler, searches, analyses };
  };
  const drain = async (runner: JobRunner) => {
    let total = 0;
    for (let r = await runner.runOnce(); r.received > 0; r = await runner.runOnce()) total += r.received;
    return total;
  };
  const analysesOf = (huntId: string) =>
    prisma.dealAnalysis.findMany({ where: { huntMatch: { huntId } }, include: { listing: true, huntMatch: true } });

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const subject = `int-test-${randomUUID().slice(0, 8)}`;
    userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;
    const hunt = async (data: { maxPriceMinor: number | null; targetProfitMinor: number | null }) =>
      (
        await prisma.hunt.create({
          data: {
            userId,
            name: 'iPhone 13',
            query: 'iPhone 13',
            status: 'LIVE',
            locationText: 'Cape Town',
            radiusKm: 40,
            priceCurrency: 'ZAR',
            ...data,
            // Due at the test clock only: a real worker running alongside never claims these hunts.
            marketplaces: { create: [{ marketplaceId: market.ebay, nextPollAt: epoch }, { marketplaceId: market.facebook, nextPollAt: epoch }] },
          },
        })
      ).id;
    priced = await hunt({ maxPriceMinor: 450_000, targetProfitMinor: 100_000 });
    open = await hunt({ maxPriceMinor: null, targetProfitMinor: null });
  });

  afterAll(async () => {
    if (prisma && userId) {
      // Analyses outlive their match (SetNull), so delete them first.
      await prisma.dealAnalysis.deleteMany({ where: { huntMatch: { hunt: { userId } } } });
      const runs = await prisma.searchRun.findMany({ where: { huntIds: { hasSome: [priced, open] } }, select: { id: true } });
      const runIds = runs.map((r) => r.id);
      const raws = await prisma.rawListing.findMany({ where: { searchRunId: { in: runIds } }, select: { listingId: true } });
      const listingIds = [...new Set(raws.map((r) => r.listingId).filter((id): id is string => id !== null))];
      await prisma.rawListing.deleteMany({ where: { searchRunId: { in: runIds } } });
      await prisma.searchRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.listing.deleteMany({ where: { id: { in: listingIds }, rawListings: { none: {} }, dealAnalyses: { none: {} } } });
      await prisma.job.deleteMany({ where: { queue: { in: [SEARCH_QUEUE, ANALYSIS_QUEUE] } } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma?.$disconnect();
  });

  it('enqueues one analysis job per open match a search confirms', async () => {
    const { scheduler, searches } = pipeline();
    await scheduler.scheduleDue();
    expect(await drain(searches)).toBeGreaterThan(0);
    const openMatches = await prisma.huntMatch.count({ where: { huntId: { in: [priced, open] }, status: { in: ['NEW', 'SEEN'] } } });
    expect(openMatches).toBeGreaterThan(0);
    const jobs = await prisma.job.findMany({ where: { queue: ANALYSIS_QUEUE } });
    expect(jobs).toHaveLength(openMatches);
    expect(jobs.every((j) => j.type === ANALYSIS_JOB_TYPE)).toBe(true);
  });

  it('stores a scored DealAnalysis per match: AI analysis + deterministic economics + strength / confidence', async () => {
    const { analyses } = pipeline();
    const jobs = await prisma.job.count({ where: { queue: ANALYSIS_QUEUE } });
    expect(await drain(analyses)).toBe(jobs);
    expect(await prisma.job.count({ where: { queue: ANALYSIS_QUEUE, status: 'SUCCEEDED' } })).toBe(jobs);

    const all = [...(await analysesOf(priced)), ...(await analysesOf(open))];
    expect(all).toHaveLength(jobs);
    for (const a of all) {
      expect(a).toMatchObject({ status: 'COMPLETED', provider: 'mock', schemaVersion: 1, scoringVersion: 1, errorMessage: null });
      expect(a.inputHash).toMatch(/^[0-9a-f]{64}$/);
      expect(['exceptional', 'strong', 'moderate', 'weak']).toContain(a.strength);
      expect(['high', 'medium', 'low']).toContain(a.confidence);
      expect(a.score).toBeGreaterThanOrEqual(5);
      const economics = a.economics as unknown as DealEconomics;
      // No resale source exists: nothing is estimated, so nothing can be exceptional or high-confidence.
      expect(economics.resale).toMatchObject({ status: 'unavailable', reason: 'no_source' });
      expect(economics.estimatedUpside.status).toBe('unavailable');
      expect(a.strength).not.toBe('exceptional');
      expect(a.confidence).not.toBe('high');
      expect(economics.asking).toEqual(a.listing.priceMinor === null ? null : { amountMinor: a.listing.priceMinor, currency: 'ZAR' });
      if (a.listing.marketplaceId === market.ebay) expect(economics.knownCosts.map((c) => c.kind)).toEqual(['shipping']);
      else expect(economics.knownCosts).toEqual([]);
    }
  });

  it('only some matches are eligible for an alert, and each decision is explained', async () => {
    const pricedAnalyses = await analysesOf(priced);
    const eligible = pricedAnalyses.filter((a) => a.alertEligible);
    const notEligible = pricedAnalyses.filter((a) => !a.alertEligible);
    expect(eligible.length).toBeGreaterThan(0);
    expect(notEligible.length).toBeGreaterThan(0);
    for (const a of eligible) {
      expect(a).toMatchObject({ strength: 'strong', alertKind: 'deal' });
      expect(a.listing.status).toBe('ACTIVE');
      expect(a.huntMatch!.status).toBe('NEW');
      const scoring = a.scoring as unknown as Scoring;
      expect(scoring.alert.blockedBy).toEqual([]);
      // The profit target can't be checked yet, and the record says so.
      expect(scoring.strengthReasons.map((r) => r.code)).toEqual(expect.arrayContaining(['within_max_price', 'target_unverified']));
    }
    for (const a of notEligible) {
      expect(a.alertKind).toBeNull();
      expect((a.scoring as unknown as Scoring).alert.blockedBy.length).toBeGreaterThan(0);
    }
    // Faulty listings are ruled out whatever their price.
    const forParts = pricedAnalyses.filter((a) => a.listing.externalId.endsWith('-for-parts'));
    expect(forParts.length).toBeGreaterThan(0);
    expect(forParts.every((a) => a.strength === 'weak' && !a.alertEligible)).toBe(true);
    // A hunt with no max price or target of its own never alerts: nothing of yours was verified.
    const openAnalyses = await analysesOf(open);
    expect(openAnalyses.length).toBeGreaterThan(0);
    expect(openAnalyses.some((a) => a.alertEligible)).toBe(false);
    expect(openAnalyses.every((a) => (a.scoring as unknown as Scoring).strengthReasons.some((r) => r.code === 'no_verified_criterion'))).toBe(true);
  });

  it('is idempotent: redelivered jobs and later searches of unchanged listings add no analyses', async () => {
    const before = await prisma.dealAnalysis.count({ where: { huntMatch: { hunt: { userId } } } });
    await prisma.job.updateMany({ where: { queue: ANALYSIS_QUEUE }, data: { status: 'QUEUED', runAt: new Date(t) } });
    const { scheduler, searches, analyses } = pipeline();
    await drain(analyses);
    expect(await prisma.dealAnalysis.count({ where: { huntMatch: { hunt: { userId } } } })).toBe(before);

    // Next polling window, same day: new search runs enqueue new jobs, but the inputs are unchanged.
    t += INTERVAL;
    await scheduler.scheduleDue();
    await drain(searches);
    expect(await drain(analyses)).toBeGreaterThan(0);
    expect(await prisma.dealAnalysis.count({ where: { huntMatch: { hunt: { userId } } } })).toBe(before);
  });

  it('retries a transient AI failure, then stores it as FAILED (economics kept, never eligible)', async () => {
    const target = (await analysesOf(priced)).find((a) => a.alertEligible)!;
    await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: target.huntMatchId! } });
    const failing = createMockAIProvider();
    failing.explainDeal = () => Promise.reject(new AIProviderError('UNAVAILABLE', 'model endpoint down'));
    const registry = new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR' }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR' }), clock),
    ]);
    const handler = new DealAnalysisHandler(prisma, failing, registry, undefined, clock);
    const job = (attempt: number) => ({
      id: randomUUID(), queue: ANALYSIS_QUEUE, type: ANALYSIS_JOB_TYPE, payload: { huntMatchId: target.huntMatchId! },
      attempt, maxAttempts: 3, leaseToken: 'x', leasedUntil: new Date(t + 60_000),
    });

    await expect(handler.analyze(job(1))).rejects.toBeInstanceOf(RetryableJobError);
    expect(await prisma.dealAnalysis.count({ where: { huntMatchId: target.huntMatchId! } })).toBe(0);

    // A rate limit waits as long as the AI provider asked (e.g. Foundry retry-after-ms).
    const retryAfter = new Date(t + 45_000);
    const limited = createMockAIProvider();
    limited.explainDeal = () => Promise.reject(new AIProviderError('RATE_LIMITED', 'Rate limit is exceeded', [], { retryAfter }));
    const limitedHandler = new DealAnalysisHandler(prisma, limited, registry, undefined, clock);
    await expect(limitedHandler.analyze(job(1))).rejects.toMatchObject({ name: 'RetryableJobError', retryAt: retryAfter });

    expect(await handler.analyze(job(3))).toBe('failed');
    const failed = await prisma.dealAnalysis.findFirstOrThrow({ where: { huntMatchId: target.huntMatchId! } });
    expect(failed).toMatchObject({ status: 'FAILED', strength: null, confidence: null, score: null, alertEligible: false, alertKind: null });
    expect(failed.errorMessage).toContain('model endpoint down');
    expect((failed.economics as unknown as DealEconomics).asking).not.toBeNull();
    expect((failed.scoring as unknown as Scoring).alert.blockedBy).toContain('analysis_completed');

    // Once the provider recovers, the same input is analysed again and the FAILED row is replaced.
    const healthy = new DealAnalysisHandler(prisma, createMockAIProvider(), registry, undefined, clock);
    expect(await healthy.analyze(job(1))).toBe('analyzed');
    const rows = await prisma.dealAnalysis.findMany({ where: { huntMatchId: target.huntMatchId! } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: failed.id, status: 'COMPLETED', alertEligible: true });
  });

  it('never analyses a match the user dismissed', async () => {
    const dismissed = (await analysesOf(priced))[0]!;
    await prisma.huntMatch.update({ where: { id: dismissed.huntMatchId! }, data: { status: 'DISMISSED' } });
    await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: dismissed.huntMatchId! } });

    const { scheduler, searches, analyses } = pipeline();
    t += INTERVAL;
    await scheduler.scheduleDue();
    await drain(searches);
    await drain(analyses);
    expect(await prisma.dealAnalysis.count({ where: { huntMatchId: dismissed.huntMatchId! } })).toBe(0);
    expect(await prisma.job.count({ where: { queue: ANALYSIS_QUEUE, payload: { equals: { huntMatchId: dismissed.huntMatchId! } }, status: 'QUEUED' } })).toBe(0);
  });
});
