import { Prisma, type Hunt, type HuntMatch, type Listing, type PrismaClient } from '@rein-drop/db';
import { LISTING_CONDITIONS, type ListingCondition, type MarketplaceId } from '@rein-drop/marketplace-core';
import { canonicalOf, evaluateMatch, type HuntTarget, type MatchHunt, type MatchListing } from '@rein-drop/matching';
import type { Clock } from '../queue/job-queue.js';

export interface MatchStageInput {
  runId: string;
  huntIds: string[];
  marketplace: MarketplaceId;
  /** Whether the source search applied the hunts' location / radius (same for the whole group). */
  locationEnforcedBySource: boolean;
}

export interface MatchStageSummary {
  matchedCount: number;
  newMatchCount: number;
  rejectedCount: number;
  duplicateCount: number;
  rejectionSummary: Record<string, number>;
}

export interface MatchStageResult {
  /** Counts stored on the SearchRun. */
  summary: MatchStageSummary;
  /** Open (NEW / SEEN) matches this run confirmed - the candidates for deal analysis. */
  openMatchIds: string[];
}

const OPEN: ReadonlySet<HuntMatch['status']> = new Set(['NEW', 'SEEN']);
const ACTIVE_LISTING: ReadonlySet<Listing['status']> = new Set(['ACTIVE', 'UNKNOWN']);

/**
 * After a search run is normalized: resolve duplicate groups among its listings, then evaluate
 * every (hunt, listing) pair with the deterministic matcher and persist HuntMatches with reasons.
 *
 * Idempotent: duplicate groups are recomputed from scratch; matches are keyed by (hunt, listing);
 * run counts are absolute for the latest attempt. Status rules:
 * - matches -> NEW on first match; an EXPIRED match that matches again returns to NEW;
 * - stops matching (sold, price raised, duplicate ...) -> NEW/SEEN become EXPIRED with a reason;
 * - DISMISSED is the user's decision: only its reasons are refreshed.
 */
export class MatchStage {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async run(input: MatchStageInput): Promise<MatchStageResult> {
    const listingIds = [
      ...new Set(
        (
          await this.prisma.rawListing.findMany({
            where: { searchRunId: input.runId, status: 'NORMALIZED', listingId: { not: null } },
            select: { listingId: true },
          })
        ).map((r) => r.listingId!),
      ),
    ];
    await this.resolveDuplicates(listingIds);

    const [listings, hunts, existing] = await Promise.all([
      this.prisma.listing.findMany({ where: { id: { in: listingIds } } }),
      this.prisma.hunt.findMany({
        where: { id: { in: input.huntIds } },
        include: { marketplaces: { where: { isEnabled: true }, select: { marketplace: { select: { key: true } } } } },
      }),
      this.prisma.huntMatch.findMany({ where: { huntId: { in: input.huntIds }, listingId: { in: listingIds } } }),
    ]);
    const existingByPair = new Map(existing.map((m) => [`${m.huntId}:${m.listingId}`, m]));
    const summary: MatchStageSummary = { matchedCount: 0, newMatchCount: 0, rejectedCount: 0, duplicateCount: 0, rejectionSummary: {} };
    const openMatchIds: string[] = [];
    const now = this.clock();

    for (const hunt of hunts) {
      const criteria = toMatchHunt(hunt);
      for (const listing of listings) {
        const current = existingByPair.get(`${hunt.id}:${listing.id}`);
        if (listing.duplicateOfId) {
          summary.duplicateCount += 1;
          if (current && OPEN.has(current.status)) {
            await this.prisma.huntMatch.update({
              where: { id: current.id },
              data: { status: 'EXPIRED', statusReason: 'duplicate', lastEvaluatedAt: now },
            });
          }
          continue;
        }

        const result = evaluateMatch(criteria, toMatchListing(listing, input.marketplace), {
          locationEnforcedBySource: input.locationEnforcedBySource,
        });
        const evaluation = {
          reasons: result.checks as unknown as Prisma.InputJsonValue,
          relevanceScore: result.relevanceScore,
          economics: result.economics as unknown as Prisma.InputJsonValue,
          matcherVersion: result.version,
          lastEvaluatedAt: now,
        };

        if (result.matched) {
          summary.matchedCount += 1;
          if (!current) {
            const created = await this.prisma.huntMatch.upsert({
              where: { huntId_listingId: { huntId: hunt.id, listingId: listing.id } },
              create: { huntId: hunt.id, listingId: listing.id, status: 'NEW', firstSearchRunId: input.runId, matchedAt: now, ...evaluation },
              update: evaluation,
              select: { id: true, status: true },
            });
            if (OPEN.has(created.status)) openMatchIds.push(created.id);
          } else {
            const revived = current.status === 'EXPIRED';
            await this.prisma.huntMatch.update({
              where: { id: current.id },
              data: { ...evaluation, ...(revived ? { status: 'NEW', statusReason: 'matches_again' } : {}) },
            });
            // DISMISSED stays the user's decision: never re-analysed.
            if (revived || OPEN.has(current.status)) openMatchIds.push(current.id);
          }
          continue;
        }

        summary.rejectedCount += 1;
        for (const check of result.failed) summary.rejectionSummary[check] = (summary.rejectionSummary[check] ?? 0) + 1;
        if (current) {
          await this.prisma.huntMatch.update({
            where: { id: current.id },
            data: {
              ...evaluation,
              ...(OPEN.has(current.status) ? { status: 'EXPIRED', statusReason: result.failed.join(',') } : {}),
            },
          });
        }
      }
    }
    summary.newMatchCount = await this.prisma.huntMatch.count({ where: { firstSearchRunId: input.runId } });
    return { summary, openMatchIds };
  }

  /**
   * Recomputes every duplicate group touched by these listings: the first-seen active listing is
   * canonical; other active members point at it; inactive members are history (no link).
   */
  private async resolveDuplicates(listingIds: string[]): Promise<void> {
    const keys = await this.prisma.listing.findMany({
      where: { id: { in: listingIds }, dedupeKey: { not: null } },
      select: { dedupeKey: true },
      distinct: ['dedupeKey'],
    });
    for (const { dedupeKey } of keys) {
      const members = await this.prisma.listing.findMany({ where: { dedupeKey }, select: { id: true, firstSeenAt: true, status: true } });
      const canonical = canonicalOf(members.filter((m) => ACTIVE_LISTING.has(m.status)));
      const active = [...ACTIVE_LISTING];
      await this.prisma.$transaction([
        // Sold / ended members are history: never duplicates of anything.
        this.prisma.listing.updateMany({ where: { dedupeKey, status: { notIn: active } }, data: { duplicateOfId: null } }),
        ...(canonical
          ? [
              this.prisma.listing.update({ where: { id: canonical.id }, data: { duplicateOfId: null } }),
              this.prisma.listing.updateMany({
                where: { dedupeKey, status: { in: active }, id: { not: canonical.id } },
                data: { duplicateOfId: canonical.id },
              }),
            ]
          : []),
      ]);
    }
  }
}

type HuntWithMarketplaces = Hunt & { marketplaces: { marketplace: { key: string } }[] };

export function toMatchHunt(hunt: HuntWithMarketplaces): MatchHunt {
  const target: HuntTarget | null =
    hunt.targetProfitMinor !== null && hunt.priceCurrency
      ? { kind: 'profit', amount: { amountMinor: hunt.targetProfitMinor, currency: hunt.priceCurrency } }
      : hunt.targetMarginPercent !== null
        ? { kind: 'margin', percent: hunt.targetMarginPercent }
        : null;
  return {
    query: hunt.query,
    marketplaces: hunt.marketplaces.map((m) => m.marketplace.key as MarketplaceId),
    conditions: hunt.conditions.filter((c): c is ListingCondition => (LISTING_CONDITIONS as readonly string[]).includes(c)),
    location: hunt.locationText ? { text: hunt.locationText, radiusKm: hunt.radiusKm } : null,
    maxPrice: hunt.maxPriceMinor !== null && hunt.priceCurrency ? { amountMinor: hunt.maxPriceMinor, currency: hunt.priceCurrency } : null,
    exclusions: hunt.exclusions,
    target,
  };
}

export function toMatchListing(listing: Listing, marketplace: MarketplaceId): MatchListing {
  return {
    marketplace,
    title: listing.title,
    description: listing.description,
    price: listing.priceMinor !== null && listing.currency ? { amountMinor: listing.priceMinor, currency: listing.currency } : null,
    conditionText: listing.conditionText,
    status: listing.status,
  };
}
