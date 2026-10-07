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
} from '@rein-drop/marketplace-core';
import type { Clock, LeasedJob } from '../queue/job-queue.js';
import { PermanentJobError, RetryableJobError, type JobHandler } from '../queue/job-runner.js';
import { SEARCH_JOB_TYPE, type SearchJobPayload } from './search-plan.js';

/** UsageEvent key for one marketplace search performed for one hunt (cost tracking). */
export const HUNT_POLL_USAGE_KEY = 'hunt_poll';

export interface MarketplaceSearchHandlerOptions {
  /** Pages fetched per search (newest listings come first). */
  maxPages: number;
}

/**
 * Runs one grouped marketplace search: fetch -> store RawListings -> normalize into Listings ->
 * record SearchRun, per-hunt polling metadata and usage.
 *
 * Idempotent / retry-safe: the SearchRun is keyed by the job id; raw records are unique per
 * (run, marketplace, externalId); only PENDING raw records are normalized; Listing writes never
 * move `lastSeenAt` backwards; usage events carry an idempotency key per (run, hunt).
 */
export class MarketplaceSearchHandler implements JobHandler<SearchJobPayload> {
  readonly type = SEARCH_JOB_TYPE;
  private readonly logger = new Logger(MarketplaceSearchHandler.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: MarketplaceRegistry,
    private readonly options: MarketplaceSearchHandlerOptions,
    private readonly clock: Clock = () => new Date(),
  ) {}

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

    try {
      const pages = await this.fetch(adapter, payload, run.id, marketplace.id);
      await this.normalizePending(adapter, run.id);
      await this.finishRun(run.id, pages, huntIds, targets, marketplace.id, payload.marketplace);
    } catch (err) {
      await this.prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorCode: isMarketplaceError(err) ? err.code : 'INTERNAL',
          errorMessage: describe(err).slice(0, 2000),
          finishedAt: this.clock(),
        },
      });
      await this.recordPollFailure(huntIds, marketplace.id, err);
      if (isMarketplaceError(err)) {
        if (err.retryable) throw new RetryableJobError(`${err.code}: ${err.message}`, err.retryAfter);
        throw new PermanentJobError(`${err.code}: ${err.message}`);
      }
      throw err; // database / unexpected errors: let the runner retry with backoff
    }
  }

  /** Fetches up to maxPages and stores every raw record (duplicates from a retry are ignored). */
  private async fetch(adapter: MarketplaceAdapter, payload: SearchJobPayload, runId: string, marketplaceId: string): Promise<number> {
    const limit = adapter.capabilities.maxPageSize;
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result = await adapter.search({ ...payload.criteria, limit, cursor });
      pages += 1;
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
    } while (cursor !== null && pages < this.options.maxPages);
    return pages;
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
    pages: number,
    huntIds: string[],
    targets: { huntId: string; hunt: { userId: string } }[],
    marketplaceId: string,
    marketplaceKey: string,
  ): Promise<void> {
    const now = this.clock();
    const resultCount = await this.prisma.rawListing.count({ where: { searchRunId: runId } });
    await this.prisma.$transaction([
      this.prisma.searchRun.update({
        where: { id: runId },
        data: { status: 'SUCCEEDED', pagesFetched: pages, resultCount, finishedAt: now },
      }),
      this.prisma.huntMarketplace.updateMany({
        where: { huntId: { in: huntIds }, marketplaceId },
        data: { lastPolledAt: now, lastPollStatus: 'SUCCEEDED', lastPollErrorCode: null, lastPollError: null, consecutiveFailures: 0 },
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
