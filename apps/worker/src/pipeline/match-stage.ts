import { Prisma, type Hunt, type HuntMatch, type Listing, type PrismaClient } from '@rein-drop/db';
import { LISTING_CONDITIONS, type ListingCondition, type MarketplaceId } from '@rein-drop/marketplace-core';
import { LOCAL_MARKETPLACES, type MarketplaceKey } from '@rein-drop/contracts';
import { canonicalOf, evaluateMatch, type HuntTarget, type MatchHunt, type MatchListing, type MatchPoint } from '@rein-drop/matching';
import type { Clock } from '../queue/job-queue.js';
import type { ListingPlaces } from './listing-places.js';

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

const OPEN_STATUSES: HuntMatch['status'][] = ['NEW', 'SEEN'];
const OPEN: ReadonlySet<HuntMatch['status']> = new Set(OPEN_STATUSES);
const ACTIVE_LISTING: ReadonlySet<Listing['status']> = new Set(['ACTIVE', 'UNKNOWN']);

/**
 * After a search run is normalized: resolve duplicate groups among its listings, then evaluate
 * every (hunt, listing) pair with the deterministic matcher and persist HuntMatches with reasons.
 *
 * Idempotent: duplicate groups are recomputed from scratch; matches are keyed by (hunt, listing);
 * run counts are absolute for the latest attempt. Status rules:
 * - matches -> NEW on first match; an EXPIRED match that matches again returns to NEW;
 * - stops matching (sold, price raised, duplicate ...) -> NEW/SEEN become EXPIRED with a reason;
 * - DISMISSED (Ignore) and BOUGHT are the user's decisions: only their reasons are refreshed, and
 *   every status change is conditional, so a decision made meanwhile is never overwritten.
 */
export class MatchStage {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock = () => new Date(),
    /** Listing places for distance checks (decision 0017); absent = distance stays unchecked. */
    private readonly places: ListingPlaces | null = null,
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
        include: { marketplaces: { where: { isEnabled: true }, select: { marketplace: { select: { key: true } } } }, user: { select: { countryCode: true } } },
      }),
      this.prisma.huntMatch.findMany({ where: { huntId: { in: input.huntIds }, listingId: { in: listingIds } } }),
    ]);
    const existingByPair = new Map(existing.map((m) => [`${m.huntId}:${m.listingId}`, m]));
    const summary: MatchStageSummary = { matchedCount: 0, newMatchCount: 0, rejectedCount: 0, duplicateCount: 0, rejectionSummary: {} };
    const openMatchIds: string[] = [];
    const now = this.clock();
    const localPickup = (LOCAL_MARKETPLACES as readonly string[]).includes(input.marketplace as MarketplaceKey);
    const placesByCountry = await this.listingPlaces(hunts, listings, localPickup, input.locationEnforcedBySource);

    for (const hunt of hunts) {
      const criteria = toMatchHunt(hunt);
      for (const listing of listings) {
        const current = existingByPair.get(`${hunt.id}:${listing.id}`);
        if (listing.duplicateOfId) {
          summary.duplicateCount += 1;
          if (current && OPEN.has(current.status)) {
            await this.setStatusIf(current.id, OPEN_STATUSES, { status: 'EXPIRED', statusReason: 'duplicate', lastEvaluatedAt: now });
          }
          continue;
        }

        const point = listing.locationText ? (placesByCountry.get(hunt.user.countryCode ?? '')?.get(listing.locationText.trim()) ?? null) : null;
        const result = evaluateMatch(criteria, { ...toMatchListing(listing, input.marketplace), point }, {
          locationEnforcedBySource: input.locationEnforcedBySource,
          localPickup,
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
            await this.prisma.huntMatch.update({ where: { id: current.id }, data: evaluation });
            const revived = current.status === 'EXPIRED' && (await this.setStatusIf(current.id, ['EXPIRED'], { status: 'NEW', statusReason: 'matches_again' }));
            // DISMISSED / BOUGHT stay the user's decisions: never re-analysed.
            if (revived || OPEN.has(current.status)) openMatchIds.push(current.id);
          }
          continue;
        }

        summary.rejectedCount += 1;
        for (const check of result.failed) summary.rejectionSummary[check] = (summary.rejectionSummary[check] ?? 0) + 1;
        if (current) {
          await this.prisma.huntMatch.update({ where: { id: current.id }, data: evaluation });
          if (OPEN.has(current.status)) {
            await this.setStatusIf(current.id, OPEN_STATUSES, { status: 'EXPIRED', statusReason: result.failed.join(',') });
          }
        }
      }
    }
    summary.newMatchCount = await this.prisma.huntMatch.count({ where: { firstSearchRunId: input.runId } });
    return { summary, openMatchIds };
  }

  /**
   * Listing coordinates per hunt-owner country, only when some hunt actually needs a distance check:
   * a local-pickup marketplace the source didn't filter by area, and a placed hunt location.
   */
  private async listingPlaces(
    hunts: (HuntWithMarketplaces & { user: { countryCode: string | null } })[],
    listings: Listing[],
    localPickup: boolean,
    enforcedBySource: boolean,
  ): Promise<Map<string, Map<string, MatchPoint | null>>> {
    const byCountry = new Map<string, Map<string, MatchPoint | null>>();
    if (!this.places || !localPickup || enforcedBySource) return byCountry;
    const texts = listings.map((l) => l.locationText).filter((t): t is string => Boolean(t));
    const countries = new Set(hunts.filter((h) => h.locationLat !== null).map((h) => h.user.countryCode ?? ''));
    for (const country of countries) byCountry.set(country, await this.places.resolve(texts, country || null));
    return byCountry;
  }

  /**
   * Status change only if the match is still in one of `from`: the user may have ignored or
   * bought it since it was read (Deals API), and their decision always wins.
   */
  private async setStatusIf(id: string, from: HuntMatch['status'][], data: Prisma.HuntMatchUpdateManyMutationInput): Promise<boolean> {
    const { count } = await this.prisma.huntMatch.updateMany({ where: { id, status: { in: from } }, data });
    return count === 1;
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
    location: hunt.locationText
      ? {
          text: hunt.locationText,
          radiusKm: hunt.radiusKm,
          point: hunt.locationLat !== null && hunt.locationLng !== null ? { lat: hunt.locationLat, lng: hunt.locationLng } : null,
        }
      : null,
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
