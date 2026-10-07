import { Logger } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@rein-drop/db';
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
}

export interface ScheduleSummary {
  claimed: number;
  enqueued: number;
  duplicates: number;
  failed: number;
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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: JobQueue,
    private readonly options: HuntSchedulerOptions,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async scheduleDue(): Promise<ScheduleSummary> {
    const now = this.clock();
    const next = new Date(now.getTime() + this.options.pollIntervalMs);
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

    const summary: ScheduleSummary = { claimed: targets.length, enqueued: 0, duplicates: 0, failed: 0 };
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
