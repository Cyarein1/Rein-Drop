import { Inject, Injectable } from '@nestjs/common';
import type { Home, Money } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';
import { DealsService } from '../deals/deals.service.js';
import { loadHuntActivity } from '../hunts/hunt-activity.js';
import { SellerSnapshotService } from '../seller-profile/seller-snapshot.service.js';
import { profitSnapshot } from './profit.js';
import { homeRecommendation } from './recommendation.js';

/** Realized profit window ("current period", App Flow Blueprint section 8). */
export const HOME_PROFIT_PERIOD_DAYS = 30;
const TOP_DEALS = 3;
const LIVE_HUNTS_SHOWN = 5;
const RECENT_ITEMS = 5;

/**
 * Composition for Home: reads Deals (ranked feed), Hunts (activity), Notifications (alerts),
 * Outcomes (purchases, sales, costs), Seller Snapshot and push devices. Read-only.
 */
@Injectable()
export class HomeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly deals: DealsService,
    private readonly snapshot: SellerSnapshotService,
  ) {}

  async get(userId: string, now: Date = new Date()): Promise<Home> {
    const since = new Date(now.getTime() - HOME_PROFIT_PERIOD_DAYS * 86_400_000);
    const money = (amountMinor: number, currency: string): Money => ({ amountMinor, currency });

    const [snapshot, hunts, top, unreadAlerts, pushDevices, purchases, sales, holding, everSold, recentAlerts] = await Promise.all([
      this.snapshot.get(userId),
      this.prisma.hunt.findMany({
        where: { userId, status: { not: 'ARCHIVED' } },
        select: { id: true, name: true, status: true, createdAt: true, activatedAt: true, events: { where: { type: { in: ['ACTIVATED', 'RESUMED'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
      }),
      this.deals.list(userId, { status: 'open', limit: TOP_DEALS }),
      this.prisma.alert.count({ where: { userId, readAt: null } }),
      this.prisma.pushDevice.count({ where: { userId, disabledAt: null } }),
      this.prisma.inventoryItem.findMany({
        where: { userId, purchasedAt: { gte: since } },
        select: { title: true, purchasePriceMinor: true, currency: true, purchasedAt: true, huntMatchId: true },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.sale.findMany({
        where: { userId, soldAt: { gte: since } },
        include: { inventoryItem: { select: { title: true, purchasePriceMinor: true, currency: true, huntMatchId: true, costs: { select: { amountMinor: true, currency: true } } } }, costs: { select: { amountMinor: true, currency: true, inventoryItemId: true } } },
        orderBy: { soldAt: 'desc' },
      }),
      this.prisma.inventoryItem.count({ where: { userId, status: { in: ['IN_STOCK', 'LISTED'] } } }),
      this.prisma.sale.count({ where: { userId } }),
      this.prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: RECENT_ITEMS, select: { title: true, createdAt: true, huntMatchId: true } }),
    ]);

    const activity = await loadHuntActivity(this.prisma, userId, hunts.map((h) => h.id));
    const activityOf = new Map(activity.map((a) => [a.huntId, a]));
    const live = hunts
      .filter((h) => h.status === 'LIVE')
      .sort((a, b) => (b.events[0]?.createdAt ?? b.activatedAt ?? b.createdAt).getTime() - (a.events[0]?.createdAt ?? a.activatedAt ?? a.createdAt).getTime());

    const profit = profitSnapshot(
      purchases.map((p) => ({ purchasedAt: p.purchasedAt, price: money(p.purchasePriceMinor, p.currency) })),
      sales.map((s) => ({
        soldAt: s.soldAt,
        salePrice: money(s.salePriceMinor, s.currency),
        purchasePrice: money(s.inventoryItem.purchasePriceMinor, s.inventoryItem.currency),
        // Costs on the item and on the sale itself (a cost linked to both is counted once).
        costs: [...s.inventoryItem.costs, ...s.costs.filter((c) => c.inventoryItemId === null)].map((c) => money(c.amountMinor, c.currency)),
      })),
      since,
    );

    const recent: Home['recent'] = [
      ...recentAlerts.map((a) => ({ kind: 'alert' as const, at: a.createdAt.toISOString(), title: a.title, dealId: a.huntMatchId, amount: null })),
      ...purchases.slice(0, RECENT_ITEMS).map((p) => ({ kind: 'bought' as const, at: p.purchasedAt.toISOString(), title: p.title, dealId: p.huntMatchId, amount: money(p.purchasePriceMinor, p.currency) })),
      ...sales.slice(0, RECENT_ITEMS).map((s) => ({ kind: 'sold' as const, at: s.soldAt.toISOString(), title: s.inventoryItem.title, dealId: s.inventoryItem.huntMatchId, amount: money(s.salePriceMinor, s.currency) })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, RECENT_ITEMS);

    return {
      generatedAt: now.toISOString(),
      attention: { unreadAlerts, toReview: activity.reduce((sum, a) => sum + a.counts.toReview, 0), top: top.items },
      hunts: {
        live: live.length,
        paused: hunts.filter((h) => h.status === 'PAUSED').length,
        drafts: hunts.filter((h) => h.status === 'DRAFT').length,
        items: live.slice(0, LIVE_HUNTS_SHOWN).map((h) => ({ id: h.id, name: h.name, status: h.status, activity: activityOf.get(h.id)! })),
      },
      profit: { periodDays: HOME_PROFIT_PERIOD_DAYS, since: since.toISOString(), bought: profit.bought, sold: profit.sold, holding, byCurrency: profit.byCurrency, hasSales: everSold > 0 },
      recent,
      recommendation: homeRecommendation({
        snapshot: snapshot.status,
        hunts: hunts.map((h) => ({
          id: h.id,
          name: h.name,
          status: h.status,
          liveSince: h.events[0]?.createdAt ?? h.activatedAt,
          createdAt: h.createdAt,
          activity: activityOf.get(h.id)!,
        })),
        activePushDevices: pushDevices,
        now,
      }),
    };
  }
}
