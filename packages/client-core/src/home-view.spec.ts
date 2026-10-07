import { describe, expect, it } from 'vitest';
import type { Home } from '@rein-drop/contracts';
import { attentionLine, homeTargetPath, huntsLine, profitView, recentView } from './home-view.js';

const ZA = { currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' };
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const nbsp = (s: string | undefined) => s?.replace(/[  ]/g, ' ');
const profit = (over: Partial<Home['profit']> = {}): Home['profit'] => ({
  periodDays: 30,
  since: '2026-09-07T10:00:00.000Z',
  bought: 2,
  sold: 1,
  holding: 1,
  byCurrency: [{ currency: 'ZAR', spent: ZAR(680_000), revenue: ZAR(450_000), realizedProfit: ZAR(100_000), sold: 1 }],
  hasSales: true,
  ...over,
});

describe('home view', () => {
  it('attention and hunts in words', () => {
    expect(attentionLine({ unreadAlerts: 1, toReview: 3, top: [] })).toBe('3 deals to review · 1 unread alert');
    expect(attentionLine({ unreadAlerts: 0, toReview: 0, top: [] })).toBeNull();
    expect(huntsLine({ live: 2, paused: 1, drafts: 1, items: [] })).toBe('2 active · 1 paused · 1 draft');
    expect(huntsLine({ live: 0, paused: 0, drafts: 0, items: [] })).toBe('0 active');
  });

  it('realized profit only: a number after sales, an honest caption before', () => {
    const view = profitView(profit(), ZA);
    expect(nbsp(view.realized?.value)).toBe('R 1 000,00');
    expect(view).toMatchObject({ realized: { tone: 'profit' }, caption: 'From 1 sale after recorded costs', bought: 2, sold: 1, holding: 1, periodLabel: 'Last 30 days' });
    expect(profitView(profit({ byCurrency: [{ currency: 'ZAR', spent: ZAR(1), revenue: ZAR(1), realizedProfit: ZAR(-5_000), sold: 1 }] }), ZA).realized?.tone).toBe('loss');
    expect(profitView(profit({ hasSales: false, sold: 0, byCurrency: [] }), ZA)).toMatchObject({ realized: null, caption: 'Appears after your first logged sale' });
    expect(profitView(profit({ sold: 0, byCurrency: [{ currency: 'ZAR', spent: ZAR(1), revenue: ZAR(0), realizedProfit: ZAR(0), sold: 0 }] }), ZA)).toMatchObject({ realized: null, caption: 'No sales in this period' });
  });

  it('recent items and recommendation targets', () => {
    const view = recentView({ kind: 'sold', at: '2026-10-07T08:00:00.000Z', title: 'iPhone 12', dealId: null, amount: ZAR(450_000) }, ZA, new Date('2026-10-07T10:00:00.000Z'));
    expect({ ...view, amount: nbsp(view.amount ?? undefined) }).toEqual({ label: 'Sold', title: 'iPhone 12', when: '2 h ago', amount: 'R 4 500,00', dealId: null });
    expect(homeTargetPath({ kind: 'edit_hunt', huntId: 'h1' })).toBe('/hunts/h1/edit');
    expect(homeTargetPath({ kind: 'onboarding' })).toBe('/onboarding');
  });
});
