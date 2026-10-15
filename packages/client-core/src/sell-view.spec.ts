import { describe, expect, it } from 'vitest';
import type { SellChannel, SellDraftSuggestion, SellListing } from '@rein-drop/contracts';
import { applyDraft, buildSellUpdate, channelView, draftWouldReplace, photoSrc, sellFormFrom, type SellForm } from './sell-view.js';

const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const EMPTY: SellForm = { title: '', description: '', price: '', condition: null, itemSpecifics: [], aiAssisted: false };
const DRAFT: SellDraftSuggestion = {
  title: 'Apple iPhone 13 128GB Midnight',
  description: 'Works perfectly. Small scratch on the back.',
  condition: 'good',
  itemSpecifics: [{ name: 'Brand', value: 'Apple' }],
  suggestedPrice: { amount: ZAR(580_000), basis: 'resale_estimate' },
  checks: [],
  provider: 'mock',
};
const nbsp = (s: string) => s.replace(/[  ]/g, ' ');

describe('sell form and AI drafts', () => {
  it('Use AI fills an empty form, including the price from the resale estimate', () => {
    const filled = applyDraft(EMPTY, DRAFT, false);
    expect(filled).toMatchObject({ title: DRAFT.title, description: DRAFT.description, condition: 'good', itemSpecifics: DRAFT.itemSpecifics, aiAssisted: true });
    expect(nbsp(filled.price)).toBe('5800.00');
  });

  it("keeps what the seller already wrote unless they choose to replace it; never overwrites their price", () => {
    const mine: SellForm = { ...EMPTY, title: 'My own title', price: '6 200', condition: 'like_new' };
    expect(draftWouldReplace(mine)).toBe(true);
    expect(draftWouldReplace(EMPTY)).toBe(false);
    expect(applyDraft(mine, DRAFT, false)).toMatchObject({ title: 'My own title', description: DRAFT.description, price: '6 200', condition: 'like_new' });
    expect(applyDraft(mine, DRAFT, true)).toMatchObject({ title: DRAFT.title, price: '6 200', condition: 'good' });
  });

  it('no estimate: no price is filled', () => {
    expect(applyDraft(EMPTY, { ...DRAFT, suggestedPrice: null }, false).price).toBe('');
  });

  it('builds the update: price parsed in the item currency, empty specifics dropped, bad prices refused', () => {
    const result = buildSellUpdate({ ...EMPTY, title: ' T ', price: '5 999,50', itemSpecifics: [{ name: 'Brand', value: 'Apple' }, { name: ' ', value: '' }] }, 'ZAR');
    expect(result).toEqual({ ok: true, request: { title: 'T', description: '', price: ZAR(599_950), condition: null, itemSpecifics: [{ name: 'Brand', value: 'Apple' }], aiAssisted: false } });
    expect(buildSellUpdate({ ...EMPTY, price: 'abc' }, 'ZAR')).toMatchObject({ ok: false, field: 'price' });
    expect(buildSellUpdate({ ...EMPTY, price: '0' }, 'ZAR')).toMatchObject({ ok: false, message: 'Must be more than zero' });
  });

  it('round-trips a saved listing into the form', () => {
    const listing = { title: 'T', description: 'D', price: ZAR(599_900), condition: 'fair', itemSpecifics: [], aiAssisted: true } as unknown as SellListing;
    expect(sellFormFrom(listing)).toEqual({ title: 'T', description: 'D', price: '5999.00', condition: 'fair', itemSpecifics: [], aiAssisted: true });
  });
});

describe('photos and marketplaces', () => {
  it('own photo paths resolve against the API base; source photos stay as they are', () => {
    expect(photoSrc('/media/abc.jpg?exp=1&sig=x', 'http://192.168.1.5:4000/')).toBe('http://192.168.1.5:4000/media/abc.jpg?exp=1&sig=x');
    expect(photoSrc('https://dev.example/img/a.jpg', 'http://x')).toBe('https://dev.example/img/a.jpg');
  });

  const channel = (o: Partial<SellChannel>): SellChannel => ({ marketplace: 'ebay', mode: 'api', status: 'PUBLISHED', url: null, simulated: false, assist: null, error: null, publishedAt: '2026-10-15T08:00:00Z', ...o });
  it('says plainly when a listing is simulated, waiting for the seller, failed or ended', () => {
    expect(channelView(channel({ simulated: true }), 'en-US')).toMatchObject({ label: 'Listed (simulated)', detail: 'Simulated for now - nothing was posted to eBay yet.', canEnd: true });
    expect(channelView(channel({}), 'en-US')).toMatchObject({ label: 'Listed', detail: 'Since Oct 15, 2026.' });
    expect(channelView(channel({ marketplace: 'facebook', mode: 'assisted', status: 'AWAITING_CONFIRMATION' }), 'en-US')).toMatchObject({ label: 'Waiting for you', awaiting: true, canEnd: true });
    expect(channelView(channel({ status: 'FAILED', error: 'eBay said no' }), 'en-US')).toMatchObject({ tone: 'loss', detail: 'eBay said no', canEnd: false });
    expect(channelView(channel({ status: 'ENDED' }), 'en-US')).toMatchObject({ label: 'Ended', canEnd: false });
  });
});
