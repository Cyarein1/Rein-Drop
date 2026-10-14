import { Logger } from '@nestjs/common';
import { sweepActiveHuntLimits } from '@rein-drop/access';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import type { SourceHealthPort } from '../health/source-health.store.js';
import type { Clock, JobQueue } from '../queue/job-queue.js';
import { SEARCH_JOB_TYPE, SEARCH_QUEUE, planSearchJobs, type DueTarget } from './search-plan.js';

export interface HuntSchedulerOptions {
  pollIntervalMs: number;
  maxAttempts: number;
  /** Most hunt-marketplace rows claimed per tick. */
  batchSize: number;
  /** Queue to enqueue into (default SEARCH_QUEUE). */
  queue?: string;
  /** Only consider these users' hunts (integration tests / targeted backfills). Default: everyone. */
  onlyUserIds?: string[];
  /** Source cool-downs (per-source backoff). Omit to schedule regardless of source health. */
  health?: Pick<SourceHealthPort, 'coolingDown'>;
  /**
   * How often to re-check every owner's access before scheduling (decision 0018): Hunts above the
   * owner's current plan pause, so a lapsed paid period stops paid monitoring even without a
   * billing webhook. Default 5 minutes; 0 = every tick.
   */
  accessSweepIntervalMs?: number;
}

export interface ScheduleSummary {
  claimed: number;
  enqueued: number;
  duplicates: number;
  failed: number;
  /** Hunt-marketplaces whose next check moved to the end of their source's cool-down. */
  deferred: number;
  /** Hunts paused by the access sweep this tick (owner's plan no longer covers them). */
  pausedForAccess: number;
}

/**
 * Finds LIVE hunts due for a search and turns them into queue jobs.
 *
 * Claiming is a single UPDATE (FOR UPDATE SKIP LOCKED) that pushes `nextPollAt` forward, so two
 * schedulers never claim the same row. If enqueueing a group fails, its claim is released so the
 * next tick picks it up again.
 */
export class HuntScheduler {
  private readonly logger = new Logger(HuntScheduler.name);
  private lastAccessSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: JobQueue,
    private readonly options: HuntSchedulerOptions,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async scheduleDue(): Promise<ScheduleSummary> {
    const now = this.clock();
    // Access first: only Hunts the owner's plan covers right now are scheduled (paused ones aren't LIVE).
    let pausedForAccess = 0;
    if (now.getTime() - this.lastAccessSweep >= (this.options.accessSweepIntervalMs ?? 5 * 60_000)) {
      const sweep = await sweepActiveHuntLimits(this.prisma, now, this.options.onlyUserIds);
      this.lastAccessSweep = now.getTime();
      pausedForAccess = sweep.pausedHuntIds.length;
      if (pausedForAccess > 0) this.logger.log(`Access sweep paused ${pausedForAccess} Hunt(s) above their owner's current plan`);
    }
    const next = new Date(now.getTime() + this.options.pollIntervalMs);
    // Per-source backoff: hunts due on a marketplace that is cooling down wait for it (their next
    // check moves to the end of the cool-down) instead of queueing searches that would fail.
    let deferred = 0;
    for (const cooling of (await this.options.health?.coolingDown(now)) ?? []) {
      deferred += await this.prisma.$executeRaw`
        UPDATE "HuntMarketplace" AS hm
        SET "nextPollAt" = ${cooling.retryAfter}, "updatedAt" = ${now}
        FROM "Hunt" AS h
        WHERE h.id = hm."huntId" AND hm."marketplaceId" = ${cooling.marketplaceId}::uuid
          AND hm."isEnabled" AND h.status = 'LIVE'
          AND (hm."nextPollAt" IS NULL OR hm."nextPollAt" < ${cooling.retryAfter})
          ${this.options.onlyUserIds ? Prisma.sql`AND h."userId" = ANY(${this.options.onlyUserIds}::uuid[])` : Prisma.empty}`;
    }
    const targets = await this.prisma.$queryRaw<DueTarget[]>`
      UPDATE "HuntMarketplace" AS hm
      SET "nextPollAt" = ${next}, "updatedAt" = ${now}
      FROM "Hunt" AS h, "Marketplace" AS m
      WHERE hm."huntId" = h.id AND hm."marketplaceId" = m.id
        AND (hm."huntId", hm."marketplaceId") IN (
          SELECT hm2."huntId", hm2."marketplaceId"
          FROM "HuntMarketplace" AS hm2
          JOIN "Hunt" AS h2 ON h2.id = hm2."huntId"
          JOIN "Marketplace" AS m2 ON m2.id = hm2."marketplaceId"
          WHERE hm2."isEnabled" AND m2."isEnabled" AND h2.status = 'LIVE'
            AND (hm2."nextPollAt" IS NULL OR hm2."nextPollAt" <= ${now})
            ${this.options.onlyUserIds ? Prisma.sql`AND h2."userId" = ANY(${this.options.onlyUserIds}::uuid[])` : Prisma.empty}
          ORDER BY hm2."nextPollAt" NULLS FIRST, hm2."huntId"
          LIMIT ${this.options.batchSize}
          FOR UPDATE OF hm2 SKIP LOCKED
        )
      RETURNING hm."huntId", h."userId", m.key AS marketplace, h.query, h."locationText", h."radiusKm",
                h.conditions, h."maxPriceMinor", h."priceCurrency"`;

    const summary: ScheduleSummary = { claimed: targets.length, enqueued: 0, duplicates: 0, failed: 0, deferred, pausedForAccess };
    for (const plan of planSearchJobs(targets, now, this.options.pollIntervalMs)) {
      try {
        const result = await this.queue.enqueue({
          queue: this.options.queue ?? SEARCH_QUEUE,
          type: SEARCH_JOB_TYPE,
          payload: plan.payload,
          dedupeKey: plan.dedupeKey,
          maxAttempts: this.options.maxAttempts,
        });
        summary[result.duplicate ? 'duplicates' : 'enqueued'] += 1;
      } catch (err) {
        summary.failed += 1;
        this.logger.error(`Could not enqueue ${plan.dedupeKey}; releasing its claim: ${String(err)}`);
        await this.prisma.huntMarketplace.updateMany({
          where: {
            huntId: { in: plan.payload.huntIds },
            marketplace: { key: plan.payload.marketplace },
            nextPollAt: next,
          },
          data: { nextPollAt: null },
        });
      }
    }
    return summary;
  }
}
