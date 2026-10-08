import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DealDetail, DealSummary, IgnoreDealRequest, ListDealsQuery, MarkDealBoughtRequest, MarketplaceKey, Money, Page } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { feedRank, type DealEconomics } from '@rein-drop/scoring';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { sourceStatusByKey } from '../marketplaces/source-health.js';
import { MatchingService } from '../matching/matching.service.js';
import { expectedSnapshot } from '../outcomes/ledger.js';
import { OutcomesService } from '../outcomes/outcomes.service.js';
import { decodeCursor, encodeCursor, queryFeedPage } from './deals.feed.js';
import { toDealDetail, toDealSummary, type DealRow } from './deals.mapper.js';

/** A purchase time this far ahead of the server clock is still accepted (device clock skew). */
const PURCHASE_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * The current user's deals: the ranked feed, detail, and the decisions Seen / Save / Ignore /
 * Bought. Reads compose HuntMatch + Listing + latest DealAnalysis + SavedDeal + InventoryItem;
 * writes to tables other modules own go through their services (Matching, Outcomes).
 * Every action is idempotent and returns the updated deal.
 */
@Injectable()
export class DealsService {
  private readonly clock = () => new Date();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly matching: MatchingService,
    private readonly outcomes: OutcomesService,
  ) {}

  async list(userId: string, query: ListDealsQuery): Promise<Page<DealSummary>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const asOf = after?.asOf ?? this.clock();
    const ranked = await queryFeedPage(
      this.prisma,
      { userId, huntId: query.huntId, marketplace: query.marketplace, status: query.status },
      { limit: query.limit, asOf, after },
    );
    const page = ranked.slice(0, query.limit);
    const rows = await this.load(userId, page.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.match.id, r]));
    const items = page.flatMap(({ id, rank }) => {
      const row = byId.get(id);
      return row ? [toDealSummary({ ...row, rank: Number(rank) }, asOf)] : [];
    });
    const last = page.at(-1);
    return { items, nextCursor: ranked.length > query.limit && last ? encodeCursor({ asOf, rank: last.rank, id: last.id }) : null };
  }

  async get(userId: string, id: string): Promise<DealDetail> {
    const asOf = this.clock();
    const [row] = await this.load(userId, [id]);
    if (!row) throw new AppException('NOT_FOUND', 'Deal not found', HttpStatus.NOT_FOUND);
    return toDealDetail(row, asOf);
  }

  /** The user opened it: NEW -> SEEN. */
  async markSeen(userId: string, id: string): Promise<DealDetail> {
    await this.owned(userId, id);
    await this.matching.markSeen(this.prisma, id, this.clock());
    return this.get(userId, id);
  }

  /** Save / watch. Saving an ignored deal un-ignores it. A bought deal can't be saved. */
  async save(userId: string, id: string): Promise<DealDetail> {
    const match = await this.owned(userId, id);
    if (match.status === 'BOUGHT') throw conflict('This deal is already marked as bought');
    await this.prisma.$transaction(async (tx) => {
      await this.matching.unignore(tx, id);
      await tx.savedDeal.upsert({
        where: { userId_listingId: { userId, listingId: match.listingId } },
        create: { userId, listingId: match.listingId, huntMatchId: id },
        update: {},
      });
    });
    return this.get(userId, id);
  }

  async unsave(userId: string, id: string): Promise<DealDetail> {
    const match = await this.owned(userId, id);
    await this.prisma.savedDeal.deleteMany({ where: { userId, listingId: match.listingId } });
    return this.get(userId, id);
  }

  /** "Not for me". Removes it from Saved too. */
  async ignore(userId: string, id: string, request: IgnoreDealRequest): Promise<DealDetail> {
    const match = await this.owned(userId, id);
    if (match.status === 'BOUGHT') throw conflict('A bought deal cannot be ignored');
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.matching.ignore(tx, id, request.reason ?? null, this.clock()))) throw conflict('A bought deal cannot be ignored');
      await tx.savedDeal.deleteMany({ where: { userId, listingId: match.listingId } });
    });
    return this.get(userId, id);
  }

  async unignore(userId: string, id: string): Promise<DealDetail> {
    await this.owned(userId, id);
    await this.matching.unignore(this.prisma, id);
    return this.get(userId, id);
  }

  /**
   * Records the purchase once (InventoryItem) and marks the deal BOUGHT. Repeating it returns the
   * deal unchanged - editing the purchase comes with the Outcomes screens (Build Prompt 28).
   */
  async markBought(userId: string, id: string, request: MarkDealBoughtRequest): Promise<DealDetail> {
    await this.owned(userId, id);
    const listing = await this.prisma.listing.findFirstOrThrow({ where: { huntMatches: { some: { id } } } });
    const now = this.clock();
    const purchasedAt = request.purchasedAt ? new Date(request.purchasedAt) : now;
    if (purchasedAt.getTime() > now.getTime() + PURCHASE_CLOCK_SKEW_MS) {
      throw new ValidationFailedException([{ path: 'body.purchasedAt', message: "Can't be in the future" }]);
    }
    const asking: Money | null = listing.priceMinor !== null && listing.currency ? { amountMinor: listing.priceMinor, currency: listing.currency } : null;
    const price = request.price ?? asking;
    if (!price) {
      throw new ValidationFailedException([{ path: 'body.price', message: 'This listing shows no price - enter what you paid' }]);
    }
    const costs = request.costs ?? [];
    costs.forEach((c, i) => {
      if (c.amount.currency !== price.currency) {
        throw new ValidationFailedException([{ path: `body.costs.${i}.amount.currency`, message: `Use ${price.currency}, like the price` }]);
      }
    });
    const analysis = await this.prisma.dealAnalysis.findFirst({
      where: { huntMatchId: id },
      orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { economics: true, strength: true, confidence: true },
    });
    const expected = expectedSnapshot({
      asking,
      economics: (analysis?.economics as DealEconomics | null | undefined) ?? null,
      strength: analysis?.strength ?? null,
      confidence: analysis?.confidence ?? null,
      capturedAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      // The conditional status change serializes concurrent requests: only one records the purchase.
      if (!(await this.matching.markBought(tx, id, now))) return;
      await this.outcomes.recordDealPurchase(tx, { userId, huntMatchId: id, listingId: listing.id, title: listing.title, price, purchasedAt, costs, expected });
    });
    return this.get(userId, id);
  }

  /** 404 for another user's deal (never reveal it exists). */
  private async owned(userId: string, id: string) {
    const match = await this.prisma.huntMatch.findFirst({ where: { id, hunt: { userId } }, select: { id: true, status: true, listingId: true } });
    if (!match) throw new AppException('NOT_FOUND', 'Deal not found', HttpStatus.NOT_FOUND);
    return match;
  }

  /** Loads everything a deal is built from. Ranks are computed for "now" (the feed overrides them). */
  private async load(userId: string, ids: string[]): Promise<DealRow[]> {
    if (ids.length === 0) return [];
    const matches = await this.prisma.huntMatch.findMany({
      where: { id: { in: ids }, hunt: { userId } },
      include: {
        hunt: { select: { id: true, name: true } },
        listing: { include: { marketplace: { select: { key: true } } } },
        // Same "latest analysis" as the feed SQL.
        dealAnalyses: { orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: 1 },
        inventoryItem: { select: { id: true } },
      },
    });
    const [saved, polls, sourceOf] = await Promise.all([
      this.prisma.savedDeal.findMany({ where: { userId, listingId: { in: matches.map((m) => m.listingId) } }, select: { listingId: true, createdAt: true } }),
      this.prisma.huntMarketplace.findMany({
        where: { huntId: { in: [...new Set(matches.map((m) => m.huntId))] } },
        select: { huntId: true, marketplaceId: true, lastPolledAt: true, lastPollStatus: true },
      }),
      sourceStatusByKey(this.prisma, this.clock()),
    ]);
    const savedAt = new Map(saved.map((s) => [s.listingId, s.createdAt]));
    const poll = new Map(polls.map((p) => [`${p.huntId}:${p.marketplaceId}`, p]));
    const now = this.clock();
    return matches.map((m) => {
      const analysis = m.dealAnalyses[0] ?? null;
      const from = m.listing.listedAt ?? m.listing.firstSeenAt;
      return {
        match: m,
        hunt: m.hunt,
        listing: m.listing,
        analysis,
        savedAt: savedAt.get(m.listingId) ?? null,
        poll: poll.get(`${m.huntId}:${m.listing.marketplaceId}`) ?? null,
        inventoryItemId: m.inventoryItem?.id ?? null,
        sourceHealth: sourceOf(m.listing.marketplace.key as MarketplaceKey),
        rank: feedRank(analysis?.score ?? null, (now.getTime() - from.getTime()) / 3_600_000),
      };
    });
  }
}

const conflict = (message: string) => new AppException('CONFLICT', message, HttpStatus.CONFLICT);
