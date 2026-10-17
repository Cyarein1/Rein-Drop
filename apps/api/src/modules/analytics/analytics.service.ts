import { Inject, Injectable } from '@nestjs/common';
import type {
  AnalyticsOverview,
  AnalyticsPeriod,
  HuntAnalytics,
  HuntFunnel,
  MarketplaceAnalytics,
  MarketplaceContribution,
  MarketplaceKey,
  MissedPotential,
  ProductAnalytics,
  ProductPerformance,
} from '@rein-drop/contracts';
import { MARKETPLACE_IDS } from '@rein-drop/marketplace-core';
import type { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';
import { avgDays, byRealizedProfit, closedBy, money, netRealized, percent, periodWindow, realizedBy, toClosed, toRealized } from './analytics.mapper.js';
import { huntQueries, marketplaceQueries, missedQueries, num, overviewQueries, productQueries, type Window } from './analytics.sql.js';

const MAX_PRODUCTS = 50;

/**
 * Read-only period analytics over Outcomes (items, sales, costs), Matching (deals, decisions),
 * Notifications (alerts) and Deal Intelligence (analyses). Aggregation happens in PostgreSQL
 * (analytics.sql.ts); this service only shapes rows into the contract.
 */
@Injectable()
export class AnalyticsService {
  private readonly clock = () => new Date();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private window(userId: string, period: AnalyticsPeriod) {
    const now = this.clock();
    const { since, until, info } = periodWindow(period, now);
    const w: Window = { userId, since, until };
    return { w, info, generatedAt: now.toISOString() };
  }

  async overview(userId: string, period: AnalyticsPeriod): Promise<AnalyticsOverview> {
    const { w, info, generatedAt } = this.window(userId, period);
    const [purchases, sales, holding, closedRows] = await overviewQueries(this.prisma, w);
    const realized = sales.map(toRealized);
    const closed = closedRows.map(toClosed);
    const salesCount = sales.reduce((s, r) => s + num(r.sales), 0);
    const days = sales.reduce((s, r) => s + num(r.daysTotal), 0);
    return {
      period: info,
      buys: purchases.reduce((s, r) => s + num(r.buys), 0),
      sells: salesCount,
      spent: purchases.map((r) => money(r.spent, r.currency)),
      sellingCosts: sales.map((r) => money(r.sellingCosts, r.currency)),
      realized,
      closed,
      netRealized: netRealized(realized, closed),
      avgDaysToSell: avgDays(days, salesCount),
      holding: {
        count: holding.reduce((s, r) => s + num(r.count), 0),
        costBasis: holding.map((r) => money(r.costBasis, r.currency)),
        oldestDays: holding.length === 0 ? null : Math.max(...holding.map((r) => num(r.oldestDays))),
      },
      generatedAt,
    };
  }

  async hunts(userId: string, period: AnalyticsPeriod): Promise<HuntAnalytics> {
    const { w, info, generatedAt } = this.window(userId, period);
    const [funnels, realizedRows] = await huntQueries(this.prisma, w);
    const realized = realizedBy(realizedRows, 'huntId');
    const items: HuntFunnel[] = funnels
      .map((f) => {
        const r = realized.get(f.huntId);
        const n = { found: num(f.found), alerted: num(f.alerted), viewed: num(f.viewed), saved: num(f.saved), ignored: num(f.ignored), bought: num(f.bought) };
        return {
          huntId: f.huntId,
          name: f.name,
          status: f.status,
          ...n,
          sold: r?.sales ?? 0,
          realized: r?.realized ?? [],
          ignoreRatePercent: percent(n.ignored, n.viewed),
          alertToBuyPercent: percent(n.bought, n.alerted),
        };
      })
      // Archived hunts only when they did something in the period.
      .filter((h) => h.status !== 'ARCHIVED' || h.found + h.alerted + h.viewed + h.bought + h.sold > 0)
      .sort((a, b) => Number(b.status === 'LIVE') - Number(a.status === 'LIVE') || b.found - a.found);
    return { period: info, items, generatedAt };
  }

  async products(userId: string, period: AnalyticsPeriod): Promise<ProductAnalytics> {
    const { w, info, generatedAt } = this.window(userId, period);
    const [stockRows, realizedRows, closedRows] = await productQueries(this.prisma, w);
    const realized = realizedBy(realizedRows, 'key');
    const closed = closedBy(closedRows, 'key');
    const byKey = new Map<string, ProductPerformance>();
    const entry = (key: string, name: string) => {
      let p = byKey.get(key);
      if (!p) {
        const r = realized.get(key);
        const c = closed.get(key);
        p = {
          key,
          name,
          bought: 0,
          sold: r?.sales ?? 0,
          holding: 0,
          spent: [],
          realized: r?.realized ?? [],
          avgDaysToSell: r ? avgDays(r.days, r.sales) : null,
          returned: c?.returned ?? 0,
          writtenOff: c?.writtenOff ?? 0,
          closedResult: c?.results ?? [],
        };
        byKey.set(key, p);
      }
      return p;
    };
    for (const row of stockRows) {
      const p = entry(row.key, row.name);
      p.bought += num(row.bought);
      p.holding += num(row.holding);
      if (num(row.spent) !== 0) p.spent.push(money(row.spent, row.currency));
    }
    for (const row of realizedRows) entry(row.key, row.name); // sold items always have a stock row too
    for (const row of closedRows) entry(row.key, row.name);
    const items = [...byKey.values()]
      // Only products with something in the period, or still held.
      .filter((p) => p.bought + p.sold + p.holding + p.returned + p.writtenOff > 0)
      .sort(byRealizedProfit)
      .slice(0, MAX_PRODUCTS);
    return { period: info, items, generatedAt };
  }

  async marketplaces(userId: string, period: AnalyticsPeriod): Promise<MarketplaceAnalytics> {
    const { w, info, generatedAt } = this.window(userId, period);
    const [found, alerted, bought, realizedRows, soldHere] = await marketplaceQueries(this.prisma, w);
    const realized = realizedBy(realizedRows, 'key');
    const keys: (MarketplaceKey | 'other')[] = [...MARKETPLACE_IDS, 'other'];
    const count = (rows: { key: string }[], field: string, key: string) => num((rows.find((r) => r.key === key) as Record<string, unknown> | undefined)?.[field]);
    const items: MarketplaceContribution[] = keys
      .map((key) => {
        const here = soldHere.filter((r) => r.key === key);
        return {
          marketplace: key,
          sourced: {
            found: count(found, 'found', key),
            alerted: count(alerted, 'alerted', key),
            bought: count(bought, 'bought', key),
            sold: realized.get(key)?.sales ?? 0,
            realized: realized.get(key)?.realized ?? [],
          },
          soldHere: { sales: here.reduce((s, r) => s + num(r.sales), 0), revenue: here.map((r) => money(r.revenue, r.currency)) },
        };
      })
      // "other" only when something happened outside the known marketplaces.
      .filter((m) => m.marketplace !== 'other' || m.sourced.bought + m.sourced.sold + m.soldHere.sales > 0);
    return { period: info, items, generatedAt };
  }

  async missed(userId: string, period: AnalyticsPeriod): Promise<MissedPotential> {
    const { w, info, generatedAt } = this.window(userId, period);
    const [[totals], potential, rows] = await missedQueries(this.prisma, w);
    return {
      period: info,
      count: num(totals?.count),
      gone: num(totals?.gone),
      ignored: num(totals?.ignored),
      withEstimate: num(totals?.withEstimate),
      estimatedPotential: potential.map((p) => money(p.potential, p.currency)),
      items: rows.map((r) => ({
        dealId: r.id,
        title: r.title,
        hunt: { id: r.huntId, name: r.huntName },
        marketplace: r.marketplace as MarketplaceKey,
        reason: r.reason as 'gone' | 'ignored',
        strength: r.strength,
        estimatedUpside: r.upside !== null && r.upsideCurrency ? money(r.upside, r.upsideCurrency) : null,
        foundAt: r.matchedAt.toISOString(),
      })),
      generatedAt,
    };
  }
}
