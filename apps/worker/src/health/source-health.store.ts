import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@rein-drop/db';
import type { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import type { Clock } from '../queue/job-queue.js';
import { isCoolingDown, nextHealth, probeIsUseful, type HealthOutcome, type HealthState, type SourceHealthPolicy } from './source-health.js';

/** What the pipeline needs from source health (the database store, or an in-memory one in tests). */
export interface SourceHealthPort {
  get(marketplaceId: string): Promise<HealthState | null>;
  record(marketplaceId: string, provider: string, outcome: HealthOutcome): Promise<HealthState>;
  /** Sources whose searches must wait, and until when. */
  coolingDown(now: Date): Promise<{ marketplaceId: string; retryAfter: Date }[]>;
}

/**
 * MarketplaceHealth rows. Updates are a locked read-modify-write, so concurrent workers never
 * lose an outcome.
 */
export class SourceHealthStore implements SourceHealthPort {
  private readonly logger = new Logger(SourceHealthStore.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly policy: SourceHealthPolicy,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async get(marketplaceId: string): Promise<HealthState | null> {
    // `reason` is free text in the database; only this module writes it, with HealthReason values.
    return (await this.prisma.marketplaceHealth.findUnique({ where: { marketplaceId } })) as HealthState | null;
  }

  async record(marketplaceId: string, provider: string, outcome: HealthOutcome): Promise<HealthState> {
    const now = this.clock();
    return this.prisma.$transaction(async (tx) => {
      // Lock the row (if any) for the read-modify-write.
      await tx.$queryRaw`SELECT 1 FROM "MarketplaceHealth" WHERE "marketplaceId" = ${marketplaceId}::uuid FOR UPDATE`;
      const prev = (await tx.marketplaceHealth.findUnique({ where: { marketplaceId } })) as HealthState | null;
      const next = nextHealth(prev, outcome, now, this.policy);
      const data = { ...next, provider };
      await tx.marketplaceHealth.upsert({ where: { marketplaceId }, create: { marketplaceId, ...data }, update: data });
      if (!prev || prev.status !== next.status) {
        this.logger.log(`Source ${provider}@${marketplaceId}: ${prev?.status ?? 'new'} -> ${next.status}${next.reason ? ` (${next.reason})` : ''}`);
      }
      return next;
    });
  }

  async coolingDown(now: Date): Promise<{ marketplaceId: string; retryAfter: Date }[]> {
    const rows = await this.prisma.marketplaceHealth.findMany({ where: { retryAfter: { gt: now } }, select: { marketplaceId: true, retryAfter: true } });
    return rows.map((r) => ({ marketplaceId: r.marketplaceId, retryAfter: r.retryAfter! }));
  }

  /**
   * Asks every registered source for its own health and records it where there is no recent real
   * search evidence (or the source is cooling down / not configured - so a recovery is noticed).
   */
  async probe(registry: MarketplaceRegistry, probeIntervalMs: number): Promise<number> {
    const now = this.clock();
    const [reports, markets, rows] = await Promise.all([
      registry.health(),
      this.prisma.marketplace.findMany({ select: { id: true, key: true } }),
      this.prisma.marketplaceHealth.findMany(),
    ]);
    const idOf = new Map(markets.map((m) => [m.key, m.id]));
    const current = new Map(rows.map((r) => [r.marketplaceId, r as HealthState]));
    let recorded = 0;
    for (const report of reports) {
      const id = idOf.get(report.marketplace);
      if (!id || !probeIsUseful(current.get(id) ?? null, now, probeIntervalMs)) continue;
      await this.record(id, report.provider, { kind: 'probe', health: report });
      recorded += 1;
    }
    return recorded;
  }
}

/** Same rules, no database: for tests that must not touch the shared MarketplaceHealth rows. */
export class InMemorySourceHealth implements SourceHealthPort {
  readonly states = new Map<string, HealthState>();

  constructor(
    private readonly policy: SourceHealthPolicy,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async get(marketplaceId: string) {
    return this.states.get(marketplaceId) ?? null;
  }

  async record(marketplaceId: string, _provider: string, outcome: HealthOutcome) {
    const next = nextHealth(this.states.get(marketplaceId) ?? null, outcome, this.clock(), this.policy);
    this.states.set(marketplaceId, next);
    return next;
  }

  async coolingDown(now: Date) {
    return [...this.states].filter(([, s]) => isCoolingDown(s, now)).map(([marketplaceId, s]) => ({ marketplaceId, retryAfter: s.retryAfter! }));
  }
}
