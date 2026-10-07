import type { Home, HomeTarget, Money } from '@rein-drop/contracts';
import { ageText } from './deal-view.js';
import type { HuntFormContext } from './hunt-form.js';
import { formatMoney } from './money.js';

/**
 * Home copy, shared by web and mobile. Sections answer questions (is anything worth my
 * attention? is Rein Drop working? am I making money? what next?) rather than listing KPIs.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 deals to review · 1 unread alert", or null when nothing needs the user. */
export function attentionLine(attention: Home['attention']): string | null {
  const parts = [
    attention.toReview > 0 ? `${plural(attention.toReview, 'deal')} to review` : null,
    attention.unreadAlerts > 0 ? `${plural(attention.unreadAlerts, 'unread alert')}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "2 active · 1 paused · 1 draft". */
export function huntsLine(hunts: Home['hunts']): string {
  return [
    `${hunts.live} active`,
    hunts.paused > 0 ? `${hunts.paused} paused` : null,
    hunts.drafts > 0 ? plural(hunts.drafts, 'draft') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface ProfitView {
  /** Realized profit in the user's main currency, or null before any sale exists. */
  realized: { value: string; tone: 'profit' | 'loss' | 'neutral' } | null;
  /** Shown instead of a number before the first sale, or when the period had none. */
  caption: string;
  bought: number;
  sold: number;
  holding: number;
  /** "Also R 1 200,00 profit in EUR" when sales happened in other currencies. */
  otherCurrencies: string[];
  periodLabel: string;
}

/** Realized only - never estimates. Shows the user's currency first. */
export function profitView(profit: Home['profit'], ctx: HuntFormContext): ProfitView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const main = profit.byCurrency.find((c) => c.currency === ctx.currency) ?? profit.byCurrency.find((c) => c.sold > 0) ?? null;
  const periodLabel = `Last ${profit.periodDays} days`;
  const others = profit.byCurrency.filter((c) => c !== main && c.sold > 0).map((c) => `Also ${fmt(c.realizedProfit)} realized in ${c.currency}`);
  if (!profit.hasSales) {
    return { realized: null, caption: 'Appears after your first logged sale', bought: profit.bought, sold: 0, holding: profit.holding, otherCurrencies: [], periodLabel };
  }
  if (!main || main.sold === 0) {
    return { realized: null, caption: 'No sales in this period', bought: profit.bought, sold: profit.sold, holding: profit.holding, otherCurrencies: others, periodLabel };
  }
  const amount = main.realizedProfit.amountMinor;
  return {
    realized: { value: fmt(main.realizedProfit), tone: amount > 0 ? 'profit' : amount < 0 ? 'loss' : 'neutral' },
    caption: `From ${plural(main.sold, 'sale')} after recorded costs`,
    bought: profit.bought,
    sold: profit.sold,
    holding: profit.holding,
    otherCurrencies: others,
    periodLabel,
  };
}

export interface RecentView {
  label: string;
  title: string;
  when: string;
  amount: string | null;
  dealId: string | null;
}

const RECENT_LABEL: Record<Home['recent'][number]['kind'], string> = { alert: 'Alert', bought: 'Bought', sold: 'Sold' };

export function recentView(item: Home['recent'][number], ctx: HuntFormContext, now: Date): RecentView {
  return {
    label: RECENT_LABEL[item.kind],
    title: item.title,
    when: ageText(Math.max(0, Math.floor((now.getTime() - Date.parse(item.at)) / 60_000))),
    amount: item.amount ? formatMoney(item.amount, ctx.localeTag) : null,
    dealId: item.dealId,
  };
}

/** Web path for a recommendation's action (mobile maps targets to its own routes). */
export function homeTargetPath(target: HomeTarget): string {
  switch (target.kind) {
    case 'onboarding':
      return '/onboarding';
    case 'create_hunt':
      return '/hunts/new';
    case 'hunt':
      return `/hunts/${target.huntId}`;
    case 'edit_hunt':
      return `/hunts/${target.huntId}/edit`;
    case 'start_hunt':
      return `/hunts/${target.huntId}/start`;
    case 'notifications':
      return '/settings';
  }
}
