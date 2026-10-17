import type { ListingCondition, MarketplaceKey, Money, PublishMode, SellMarketplace } from '@rein-drop/contracts';

/**
 * Cross-listing (decision 0019): one publisher per marketplace.
 * - eBay: MOCK. TODO(sell): real publishing needs eBay developer keys with the Sell APIs and each
 *   seller connecting their eBay account (OAuth, Inventory API). Nothing really appears on eBay.
 * - Facebook Marketplace: ASSISTED. Facebook has no public API for creating Marketplace listings,
 *   so Rein Drop prepares ready-to-paste text and opens Facebook; the seller confirms it's posted.
 */
export interface PublishInput {
  listingId: string;
  title: string;
  description: string;
  price: Money;
  condition: ListingCondition;
  photoCount: number;
}

export type PublishOutcome =
  | { status: 'PUBLISHED'; provider: string; externalId: string; url: string }
  | { status: 'AWAITING_CONFIRMATION'; provider: 'assisted' }
  | { status: 'FAILED'; provider: string; error: string };

/**
 * Taking a listing down: `ended` = the marketplace no longer shows it; `manual` = Rein Drop can't
 * take it down there (assisted), so the seller must remove it themselves.
 */
export type EndOutcome = 'ended' | 'manual';

export interface ListingPublisher {
  readonly info: SellMarketplace;
  publish(input: PublishInput): Promise<PublishOutcome>;
  /** Ends a live listing (a sale elsewhere, a return, a write-off, or the seller's choice). */
  end(input: { listingId: string; externalId: string | null }): Promise<EndOutcome>;
}

export const MARKETPLACE_NAME: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
export const FACEBOOK_CREATE_URL = 'https://www.facebook.com/marketplace/create/item';

const CONDITION_TEXT: Record<ListingCondition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good (used)',
  fair: 'Fair (visible wear)',
  for_parts: 'For parts / not working',
};

function money(m: Money): string {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: m.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat('en', { style: 'currency', currency: m.currency }).format(m.amountMinor / 10 ** digits);
  } catch {
    return `${m.currency} ${m.amountMinor}`;
  }
}

/** The text a seller pastes into an assisted marketplace (title, price, condition, description). */
export function assistedText(input: Pick<PublishInput, 'title' | 'description' | 'price' | 'condition'>): string {
  return [input.title, `Price: ${money(input.price)}`, `Condition: ${CONDITION_TEXT[input.condition]}`, '', input.description].join('\n');
}

class MockEbayPublisher implements ListingPublisher {
  readonly info: SellMarketplace = {
    marketplace: 'ebay',
    label: MARKETPLACE_NAME.ebay,
    mode: 'api' satisfies PublishMode,
    live: false,
    note: 'Simulated for now - nothing is posted to eBay yet. Real eBay listing comes when eBay seller access is set up.',
  };

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const externalId = `mock-${input.listingId.replaceAll('-', '').slice(-12)}`;
    return { status: 'PUBLISHED', provider: 'mock', externalId, url: `https://dev.example/ebay/itm/${externalId}` };
  }

  /** Nothing is really on eBay. TODO(sell): the real Inventory API withdraw-offer call. */
  async end(): Promise<EndOutcome> {
    return 'ended';
  }
}

class AssistedFacebookPublisher implements ListingPublisher {
  readonly info: SellMarketplace = {
    marketplace: 'facebook',
    label: MARKETPLACE_NAME.facebook,
    mode: 'assisted',
    live: true,
    note: "Facebook doesn't let apps post for you: copy the prepared text, add the photos on Facebook, then mark it posted here.",
  };

  async publish(): Promise<PublishOutcome> {
    return { status: 'AWAITING_CONFIRMATION', provider: 'assisted' };
  }

  /** No API: the seller removes it on Facebook (the app reminds them). */
  async end(): Promise<EndOutcome> {
    return 'manual';
  }
}

export const LISTING_PUBLISHERS = Symbol('LISTING_PUBLISHERS');

/** Every marketplace Rein Drop supports - open to every account during beta (decision 0019). */
export function createListingPublishers(): Map<MarketplaceKey, ListingPublisher> {
  return new Map<MarketplaceKey, ListingPublisher>([
    ['ebay', new MockEbayPublisher()],
    ['facebook', new AssistedFacebookPublisher()],
  ]);
}
