import { Logger } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import {
  MarketplaceError,
  isMarketplaceError,
  normalizeRawListing,
  type MarketplaceAdapter,
  type MarketplaceRegistry,
  type NormalizedListing,
  type RawListingRecord,
  type SourceUsage,
} from '@rein-drop/marketplace-core';
import { dedupeKeyFor } from '@rein-drop/matching';
import type { Clock, JobQueue, LeasedJob } from '../queue/job-queue.js';
import { ANALYSIS_JOB_TYPE, type AnalysisJobPayload } from './deal-analysis.handler.js';
import { DeferJobError, PermanentJobError, RetryableJobError, type JobHandler } from '../queue/job-runner.js';
import { isCoolingDown, type HealthOutcome, type HealthState } from '../health/source-health.js';
import type { SourceHealthPort } from '../health/source-health.store.js';
import { MatchStage, type MatchStageSummary } from './match-stage.js';
import { SEARCH_JOB_TYPE, type SearchJobPayload } from './search-plan.js';

/** UsageEvent key for one marketplace search performed for one hunt (cost tracking). */
export const HUNT_POLL_USAGE_KEY = 'hunt_poll';

export interface MarketplaceSearchHandlerOptions {
  /** Pages fetched per search (newest listings come first). */
  maxPages: number;
  /** Where to enqueue deal analysis for the open matches a run confirms. Omit to skip analysis. */
  analysis?: { queue: JobQueue; queueName: string; maxAttempts: number };
  /** Records source health and enforces per-source cool-downs. Omit to skip (some tests). */
  health?: SourceHealthPort;
  /** A search request taking longer than this is cancelled and counts as a timeout failure. */
  searchTimeoutMs?: number;
  /** Slow-search threshold used when no health store is configured (the store has its own policy). */
  slowMs?: number;
}

/** How one search went, for the source's health and the hunts' poll status. */
interface FetchStats {
  pages: number;
  /** Slowest single request, ms. */
  latencyMs: number;
  partial: boolean;
  /** Source usage summed over the pages that reported it (requests, results, time, cost). */
  usage: SourceUsage | null;
}

/** Adds one page's usage to the run's total (cost stays null only if no page reported one). */
export function addUsage(total: SourceUsage | null, page: SourceUsage | undefined): SourceUsage | null {
  if (!page) return total;
  if (!total) return { ...page, details: { ...page.details } };
  return {
    requests: total.requests + page.requests,
    items: total.items + page.items,
    durationMs: total.durationMs === null && page.durationMs === null ? null : (total.durationMs ?? 0) + (page.durationMs ?? 0),
    costUsd: total.costUsd === null && page.costUsd === null ? null : Math.round(((total.costUsd ?? 0) + (page.costUsd ?? 0)) * 1e6) / 1e6,
    costIsEstimate: total.costIsEstimate || page.costIsEstimate,
    details: { ...total.details, ...page.details },
  };
}

/**
 * Runs one grouped marketplace search: fetch -> store RawListings -> normalize into Listings ->
 * deduplicate + match against each hunt (MatchStage) -> record SearchRun, per-hunt polling
 * metadata and usage.
 *
 * Idempotent / retry-safe: the SearchRun is keyed by the job id; raw records are unique per
 * (run, marketplace, externalId); only PENDING raw records are normalized; Listing writes never
 * move `lastSeenAt` backwards; usage events carry an idempotency key per (run, hunt).
 */
export class MarketplaceSearchHandler implements JobHandler<SearchJobPayload> {
  readonly type = SEARCH_JOB_TYPE;
  private readonly logger = new Logger(MarketplaceSearchHandler.name);
  private readonly matchStage: MatchStage;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: MarketplaceRegistry,
    private readonly options: MarketplaceSearchHandlerOptions,
    private readonly clock: Clock = () => new Date(),
  ) {
    this.matchStage = new MatchStage(prisma, clock);
  }

  async handle(job: LeasedJob<SearchJobPayload>): Promise<void> {
    const { payload } = job;
    const marketplace = await this.prisma.marketplace.findUnique({ where: { key: payload.marketplace } });
    if (!marketplace) throw new PermanentJobError(`Unknown marketplace "${payload.marketplace}"`);

    // Hunts may have been paused, archived or edited since the job was planned.
    const targets = await this.prisma.huntMarketplace.findMany({
      where: { huntId: { in: payload.huntIds }, marketplaceId: marketplace.id, isEnabled: true, hunt: { status: 'LIVE' } },
      select: { huntId: true, hunt: { select: { userId: true } } },
    });
    if (targets.length === 0) {
      this.logger.log(`Search ${job.id} skipped: no hunt in it is still LIVE on ${payload.marketplace}`);
      return;
    }
    const huntIds = targets.map((t) => t.huntId);

    let adapter: MarketplaceAdapter;
    try {
      adapter = this.registry.get(payload.marketplace);
    } catch (err) {
      await this.recordPollFailure(huntIds, marketplace.id, err);
      throw new PermanentJobError(err instanceof Error ? err.message : String(err));
    }

    // A source cooling down (repeated failures / rate limit) is not called at all: the job waits
    // for it without using up an attempt, so one bad source can't exhaust every Hunt's retries.
    const health = await this.options.health?.get(marketplace.id);
    if (health && isCoolingDown(health, this.clock())) {
      throw new DeferJobError(`${payload.marketplace} is cooling down (${health.status}, ${health.reason ?? 'no reason'})`, health.retryAfter!);
    }

    const run = await this.prisma.searchRun.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        marketplaceId: marketplace.id,
        provider: adapter.provider,
        groupKey: payload.groupKey,
        criteria: payload.criteria,
        huntIds,
        attempts: 1,
      },
      update: { attempts: { increment: 1 }, status: 'RUNNING', errorCode: null, errorMessage: null, finishedAt: null },
    });

    let openMatchIds: string[];
    const stats: FetchStats = { pages: 0, latencyMs: 0, partial: false, usage: null };
    try {
      await this.fetch(adapter, payload, run.id, marketplace.id, stats);
      await this.normalizePending(adapter, run.id);
      const location = payload.criteria.location;
      const { summary: matches, openMatchIds: open } = await this.matchStage.run({
        runId: run.id,
        huntIds,
        marketplace: payload.marketplace,
        // Grouped hunts share location + radius, so the search applied them to every hunt in it.
        locationEnforcedBySource:
          location !== null &&
          adapter.capabilities.location !== 'unsupported' &&
          (location.radiusKm === null || adapter.capabilities.radius),
      });
      // A source that is slow by nature (declared expectedLatencyMs) isn't "slow" at its normal speed.
      const expected = adapter.capabilities.expectedLatencyMs;
      const state = await this.recordHealth(marketplace.id, adapter.provider, {
        kind: 'success',
        latencyMs: stats.latencyMs,
        partial: stats.partial,
        ...(expected ? { slowAfterMs: expected * 2 } : {}),
      });
      await this.finishRun(run.id, stats, state, huntIds, targets, marketplace.id, payload.marketplace, matches);
      openMatchIds = open;
    } catch (err) {
      await this.prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          // What was spent before the failure still counts.
          sourceUsage: (stats.usage ?? undefined) as Prisma.InputJsonValue | undefined,
          errorCode: isMarketplaceError(err) ? err.code : 'INTERNAL',
          errorMessage: describe(err).slice(0, 2000),
          finishedAt: this.clock(),
        },
      });
      await this.recordPollFailure(huntIds, marketplace.id, err);
      if (isMarketplaceError(err)) {
        // Only the source's own failures count against its health (not our database errors).
        const state = await this.recordHealth(marketplace.id, adapter.provider, {
          kind: 'failure',
          code: err.code,
          message: `${err.code}: ${err.message}`.slice(0, 500),
          latencyMs: stats.latencyMs || null,
          retryAfter: err.retryAfter,
        });
        // The retry waits for the source's cool-down (which already respects its own retryAfter).
        if (err.retryable) throw new RetryableJobError(`${err.code}: ${err.message}`, state?.retryAfter ?? err.retryAfter);
        throw new PermanentJobError(`${err.code}: ${err.message}`);
      }
      throw err; // database / unexpected errors: let the runner retry with backoff
    }

    // Outside the try: a queue error is not a marketplace failure. If it throws, the job retries;
    // the search is idempotent and the dedupe key stops double analysis jobs.
    await this.enqueueAnalysis(run.id, openMatchIds);
  }

  private async enqueueAnalysis(runId: string, matchIds: string[]): Promise<void> {
    const analysis = this.options.analysis;
    if (!analysis) return;
    for (const huntMatchId of matchIds) {
      await analysis.queue.enqueue<AnalysisJobPayload>({
        queue: analysis.queueName,
        type: ANALYSIS_JOB_TYPE,
        payload: { huntMatchId },
        dedupeKey: `${ANALYSIS_JOB_TYPE}:${huntMatchId}:${runId}`,
        maxAttempts: analysis.maxAttempts,
      });
    }
  }

  /** Fetches up to maxPages and stores every raw record (duplicates from a retry are ignored). */
  private async fetch(adapter: MarketplaceAdapter, payload: SearchJobPayload, runId: string, marketplaceId: string, stats: FetchStats): Promise<void> {
    const limit = adapter.capabilities.maxPageSize;
    let cursor: string | null = null;
    do {
      const result = await this.timedSearch(adapter, { ...payload.criteria, limit, cursor }, stats);
      stats.pages += 1;
      if (result.partial) stats.partial = true;
      stats.usage = addUsage(stats.usage, result.usage);
      if (result.listings.length > 0) {
        await this.prisma.rawListing.createMany({
          data: result.listings.map((raw) => ({
            marketplaceId,
            provider: raw.provider,
            searchRunId: runId,
            externalId: raw.externalId,
            payload: raw.payload as Prisma.InputJsonValue,
            fetchedAt: raw.fetchedAt,
          })),
          skipDuplicates: true,
        });
      }
      cursor = result.nextCursor;
    } while (cursor !== null && stats.pages < this.options.maxPages);
  }

  /** One request with a timeout; tracks the slowest latency. A timeout becomes a retryable failure. */
  private async timedSearch(adapter: MarketplaceAdapter, criteria: Parameters<MarketplaceAdapter['search']>[0], stats: FetchStats) {
    // Sources that are slow by nature get room for their normal run time.
    const expected = adapter.capabilities.expectedLatencyMs;
    const timeoutMs = this.options.searchTimeoutMs && expected ? Math.max(this.options.searchTimeoutMs, expected * 3) : this.options.searchTimeoutMs;
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(new Error('timeout')), timeoutMs) : null;
    const started = performance.now();
    try {
      return await adapter.search(criteria, { signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted && isMarketplaceError(err) && err.code === 'ABORTED') {
        const limit = timeoutMs! < 1000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs! / 1000)}s`;
        throw new MarketplaceError('UNAVAILABLE', `No answer within ${limit} (timeout)`, {
          marketplace: adapter.marketplace,
          provider: adapter.provider,
          cause: err,
        });
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      stats.latencyMs = Math.max(stats.latencyMs, performance.now() - started);
    }
  }

  private async recordHealth(marketplaceId: string, provider: string, outcome: HealthOutcome): Promise<HealthState | null> {
    if (!this.options.health) return null;
    try {
      return await this.options.health.record(marketplaceId, provider, outcome);
    } catch (err) {
      // Health is advisory: never fail (or retry) a search because it couldn't be recorded.
      this.logger.warn(`Could not record source health: ${describe(err)}`);
      return null;
    }
  }

  /** Normalizes this run's PENDING raw records, one small transaction each. */
  private async normalizePending(adapter: MarketplaceAdapter, runId: string): Promise<void> {
    const pending = await this.prisma.rawListing.findMany({
      where: { searchRunId: runId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of pending) {
      const record: RawListingRecord = {
        marketplace: adapter.marketplace,
        provider: row.provider,
        externalId: row.externalId,
        payload: row.payload as RawListingRecord['payload'],
        fetchedAt: row.fetchedAt,
      };
      const result = normalizeRawListing(adapter, record);
      await this.prisma.$transaction(async (tx) => {
        if (result.status !== 'NORMALIZED') {
          const { count } = await tx.rawListing.updateMany({
            where: { id: row.id, status: 'PENDING' },
            data: { status: result.status, statusReason: result.reason.slice(0, 1000) },
          });
          if (count === 1) await tx.searchRun.update({ where: { id: runId }, data: { unreadableCount: { increment: 1 } } });
          return;
        }
        const { listingId, created } = await upsertListing(tx, row.marketplaceId, result.listing, row.fetchedAt);
        const { count } = await tx.rawListing.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'NORMALIZED', statusReason: null, listingId },
        });
        if (count === 1) {
          await tx.searchRun.update({
            where: { id: runId },
            data: created ? { newListingCount: { increment: 1 } } : { updatedListingCount: { increment: 1 } },
          });
        }
      });
    }
  }

  private async finishRun(
    runId: string,
    stats: FetchStats,
    health: HealthState | null,
    huntIds: string[],
    targets: { huntId: string; hunt: { userId: string } }[],
    marketplaceId: string,
    marketplaceKey: string,
    matches: MatchStageSummary,
  ): Promise<void> {
    const now = this.clock();
    const resultCount = await this.prisma.rawListing.count({ where: { searchRunId: runId } });
    await this.prisma.$transaction([
      this.prisma.searchRun.update({
        where: { id: runId },
        data: { status: 'SUCCEEDED', pagesFetched: stats.pages, resultCount, finishedAt: now, sourceUsage: (stats.usage ?? undefined) as Prisma.InputJsonValue | undefined, ...matches },
      }),
      // Slow or partial: it worked, but the Hunt must not look fully healthy.
      this.prisma.huntMarketplace.updateMany({
        where: { huntId: { in: huntIds }, marketplaceId },
        data: {
          lastPolledAt: now,
          lastPollStatus: degradedReason(stats, health, this.options.slowMs) ? 'DEGRADED' : 'SUCCEEDED',
          lastPollErrorCode: degradedReason(stats, health, this.options.slowMs),
          lastPollError: null,
          consecutiveFailures: 0,
        },
      }),
      this.prisma.usageEvent.createMany({
        data: targets.map((t) => ({
          userId: t.hunt.userId,
          key: HUNT_POLL_USAGE_KEY,
          idempotencyKey: `${HUNT_POLL_USAGE_KEY}:${runId}:${t.huntId}`,
          metadata: { huntId: t.huntId, marketplace: marketplaceKey, searchRunId: runId, resultCount, sharedWith: huntIds.length - 1 },
          occurredAt: now,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  private async recordPollFailure(huntIds: string[], marketplaceId: string, err: unknown): Promise<void> {
    await this.prisma.huntMarketplace.updateMany({
      where: { huntId: { in: huntIds }, marketplaceId },
      data: {
        lastPolledAt: this.clock(),
        lastPollStatus: 'FAILED',
        lastPollErrorCode: isMarketplaceError(err) ? err.code : 'INTERNAL',
        lastPollError: describe(err).slice(0, 1000),
        consecutiveFailures: { increment: 1 },
      },
    });
  }
}

/** PARTIAL / SLOW when the search worked but not fully; null when it was a clean success. */
function degradedReason(stats: FetchStats, health: HealthState | null, slowMs: number | undefined): string | null {
  if (stats.partial) return 'PARTIAL';
  if (health ? health.reason === 'SLOW' : slowMs !== undefined && stats.latencyMs > slowMs) return 'SLOW';
  return null;
}

/**
 * Creates the Listing or refreshes it. A record older than what we already saw (e.g. from a
 * retried job) never overwrites newer data.
 */
async function upsertListing(
  tx: Prisma.TransactionClient,
  marketplaceId: string,
  listing: NormalizedListing,
  seenAt: Date,
): Promise<{ listingId: string; created: boolean }> {
  const data = {
    url: listing.url,
    title: listing.title,
    description: listing.description,
    priceMinor: listing.price?.amountMinor ?? null,
    currency: listing.price?.currency ?? null,
    conditionText: listing.conditionText,
    locationText: listing.locationText,
    imageUrls: listing.imageUrls,
    status: listing.status,
    listedAt: listing.listedAt,
    sourceMetadata: listing.sourceMetadata === null ? Prisma.DbNull : (listing.sourceMetadata as Prisma.InputJsonValue),
    dedupeKey: dedupeKeyFor(listing),
  };
  const key = { marketplaceId_externalId: { marketplaceId, externalId: listing.externalId } };
  const existing = await tx.listing.findUnique({ where: key, select: { id: true } });
  if (!existing) {
    const created = await tx.listing.create({
      data: { ...data, marketplaceId, externalId: listing.externalId, firstSeenAt: seenAt, lastSeenAt: seenAt },
      select: { id: true },
    });
    return { listingId: created.id, created: true };
  }
  await tx.listing.updateMany({ where: { id: existing.id, lastSeenAt: { lte: seenAt } }, data: { ...data, lastSeenAt: seenAt } });
  return { listingId: existing.id, created: false };
}

function describe(err: unknown): string {
  if (err instanceof MarketplaceError) return [err.message, ...err.details].join(' | ');
  return err instanceof Error ? err.message : String(err);
}
