import type { ItemSpecific, ListingCondition, MarketplaceKey, SellChannel, SellDraftSuggestion, SellListing, SellListingStatus, UpdateSellListingRequest } from '@rein-drop/contracts';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Sell workspace (decision 0019) - shared by web and mobile: the listing form, applying an AI
 * draft (always editable afterwards), photo links, and how each marketplace's listing is described.
 * No rules are re-implemented here: what blocks publishing comes from the API (`listing.missing`).
 */

export const LISTING_CONDITION_LABEL: Record<ListingCondition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  for_parts: 'For parts / not working',
};
export const LISTING_CONDITION_OPTIONS = (Object.keys(LISTING_CONDITION_LABEL) as ListingCondition[]).map((value) => ({ value, label: LISTING_CONDITION_LABEL[value] }));

export const SELL_LISTING_STATUS_LABEL: Record<SellListingStatus, { label: string; tone: 'neutral' | 'profit' | 'info' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Listed', tone: 'profit' },
  ENDED: { label: 'Ended', tone: 'neutral' },
};

/** Own photos come as API-relative signed paths ("/media/..."); source photos are absolute URLs. */
export function photoSrc(url: string, apiBaseUrl: string): string {
  return url.startsWith('/') ? `${apiBaseUrl.replace(/\/+$/, '')}${url}` : url;
}

export interface SellForm {
  title: string;
  description: string;
  /** As typed, e.g. "5 999". */
  price: string;
  condition: ListingCondition | null;
  itemSpecifics: ItemSpecific[];
  /** The seller applied an AI draft. */
  aiAssisted: boolean;
}

export function sellFormFrom(listing: SellListing): SellForm {
  return {
    title: listing.title,
    description: listing.description,
    price: listing.price ? moneyToInput(listing.price) : '',
    condition: listing.condition,
    itemSpecifics: listing.itemSpecifics,
    aiAssisted: listing.aiAssisted,
  };
}

/**
 * Fills the form from an AI draft. Fields the seller already wrote are kept unless `replace` is
 * true (the UI asks first); a price is only filled from the resale estimate, and only when empty.
 */
export function applyDraft(form: SellForm, draft: SellDraftSuggestion, replace: boolean): SellForm {
  const take = (current: string, suggested: string) => (replace || !current.trim() ? suggested : current);
  return {
    title: take(form.title, draft.title),
    description: take(form.description, draft.description),
    price: !form.price.trim() && draft.suggestedPrice ? moneyToInput(draft.suggestedPrice.amount) : form.price,
    condition: replace || !form.condition ? draft.condition : form.condition,
    itemSpecifics: replace || form.itemSpecifics.length === 0 ? draft.itemSpecifics : form.itemSpecifics,
    aiAssisted: true,
  };
}

/** True when applying the draft would overwrite something the seller wrote (ask before replacing). */
export function draftWouldReplace(form: SellForm): boolean {
  return Boolean(form.title.trim() || form.description.trim() || form.condition || form.itemSpecifics.length > 0);
}

export type SellFormResult = { ok: true; request: UpdateSellListingRequest } | { ok: false; field: 'price'; message: string };

export function buildSellUpdate(form: SellForm, currency: string): SellFormResult {
  const price = parseMoneyInput(form.price, currency);
  if (!price.ok) return { ok: false, field: 'price', message: price.message };
  if (price.money && price.money.amountMinor <= 0) return { ok: false, field: 'price', message: 'Must be more than zero' };
  return {
    ok: true,
    request: {
      title: form.title.trim(),
      description: form.description.trim(),
      price: price.money,
      condition: form.condition,
      itemSpecifics: form.itemSpecifics.filter((s) => s.name.trim() && s.value.trim()),
      aiAssisted: form.aiAssisted,
    },
  };
}

export const MARKETPLACE_NAME: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

export interface ChannelView {
  marketplace: MarketplaceKey;
  name: string;
  label: string;
  tone: 'profit' | 'fresh' | 'loss' | 'neutral';
  detail: string | null;
  /** Assisted marketplace waiting for the seller: show the text to copy, "Open", "I've posted it". */
  awaiting: boolean;
  canEnd: boolean;
}

export function channelView(channel: SellChannel, localeTag: string): ChannelView {
  const name = MARKETPLACE_NAME[channel.marketplace];
  const since = channel.publishedAt ? new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' }).format(new Date(channel.publishedAt)) : null;
  const base = { marketplace: channel.marketplace, name, awaiting: false, canEnd: channel.status === 'PUBLISHED' || channel.status === 'AWAITING_CONFIRMATION' };
  switch (channel.status) {
    case 'PUBLISHED':
      return {
        ...base,
        label: channel.simulated ? 'Listed (simulated)' : 'Listed',
        tone: 'profit',
        detail: channel.simulated ? `Simulated for now - nothing was posted to ${name} yet.` : since ? `Since ${since}.` : null,
      };
    case 'AWAITING_CONFIRMATION':
      return { ...base, label: 'Waiting for you', tone: 'fresh', detail: `Copy the text, post it on ${name}, then tell Rein Drop it's posted.`, awaiting: true };
    case 'FAILED':
      return { ...base, label: "Didn't go through", tone: 'loss', detail: channel.error ?? 'Try again.' };
    case 'ENDED':
      return { ...base, label: 'Ended', tone: 'neutral', detail: null };
  }
}

/** The seller's price, formatted, or null. */
export function sellPriceText(listing: SellListing, localeTag: string): string | null {
  return listing.price ? formatMoney(listing.price, localeTag) : null;
}
