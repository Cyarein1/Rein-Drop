import type { FetchLike, HttpResponse } from '../../http.js';

/**
 * A fake Apify API for tests: `run-sync-get-dataset-items` returning items in the actor's
 * documented output shape (docs/providers/facebook-apify.md), `GET /actors/:id`, and injectable
 * failures. Test-only - never used at runtime.
 */

const response = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

/** Shaped like the actor's published example output item. */
export function apifyItem(i: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    facebookUrl: 'https://www.facebook.com/marketplace/capetown/search/?query=iphone',
    listingUrl: `https://www.facebook.com/marketplace/item/10000000000${String(i).padStart(4, '0')}`,
    id: `10000000000${String(i).padStart(4, '0')}`,
    listing_price: { formatted_amount: `R${4000 + i * 10}`, amount: `${4000 + i * 10}.00` },
    location: { reverse_geocode: { city: 'Cape Town', state: 'Western Cape' } },
    marketplace_listing_title: `iPhone 13 128GB #${i}`,
    is_live: true,
    is_sold: false,
    is_pending: false,
    delivery_types: ['IN_PERSON'],
    marketplace_listing_seller: { name: `Seller ${i}` },
    primary_listing_photo: { image: { uri: `https://scontent.xx.fbcdn.net/v/t45/${i}.jpg` } },
    ...over,
  };
}

type Injected = { status: number; body?: unknown; headers?: Record<string, string> } | 'network';

export class FakeApify {
  readonly requests: { method: string; url: string; headers: Record<string, string>; body?: unknown }[] = [];
  items: Record<string, unknown>[];
  private queue: Injected[] = [];

  constructor(count = 30) {
    this.items = Array.from({ length: count }, (_, i) => apifyItem(i + 1));
  }

  inject(...r: Injected[]) {
    this.queue.push(...r);
  }

  readonly fetch: FetchLike = async (url, init) => {
    this.requests.push({ method: init.method, url, headers: init.headers, body: init.body ? (JSON.parse(init.body) as unknown) : undefined });
    const injected = this.queue.shift();
    if (injected === 'network') throw new Error('ECONNRESET');
    if (injected) return response(injected.status, injected.body ?? { error: { type: 'injected', message: 'Injected failure' } }, injected.headers);
    if (init.headers.Authorization !== 'Bearer apify-test-token') return response(401, { error: { type: 'token-not-valid', message: 'Authentication token is not valid.' } });
    if (init.method === 'GET' && /\/v2\/actors\/[^/?]+$/.test(url)) return response(200, { data: { id: 'x', name: 'facebook-marketplace-scraper' } });
    if (init.method === 'POST' && url.includes('/run-sync-get-dataset-items')) {
      const input = JSON.parse(init.body ?? '{}') as { startUrls: { url: string }[]; resultsLimit: number };
      const query = decodeURIComponent(/query=([^&]*)/.exec(input.startUrls[0]!.url)?.[1] ?? '').toLowerCase();
      const words = query.split(/\s+/).filter((w) => w.length > 0);
      const found = this.items.filter((it) => words.every((w) => String(it.marketplace_listing_title).toLowerCase().includes(w)));
      return response(201, found.slice(0, input.resultsLimit));
    }
    return response(404, { error: { type: 'record-not-found', message: 'Not found' } });
  };
}
