import type { FetchLike, HttpResponse } from './ebay-client.js';

/**
 * A fake eBay REST server for tests, shaped like the official Browse API responses
 * (buy_browse_v1_oas3.json): OAuth token, item_summary/search with offset / limit / next / total
 * and the price / priceCurrency / conditionIds filters, and item/{item_id}. Failures can be
 * injected per call. Test-only - never used at runtime.
 */

/** Minimal URL parsing (this package has no DOM / Node typings). */
export function parseUrl(url: string): { origin: string; pathname: string; params: Map<string, string> } {
  const m = /^(https?:\/\/[^/]+)([^?]*)(?:\?(.*))?$/.exec(url);
  if (!m) throw new Error(`Bad URL ${url}`);
  const params = new Map<string, string>();
  for (const pair of (m[3] ?? '').split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=');
    params.set(decodeURIComponent(k!), decodeURIComponent(v.replace(/\+/g, ' ')));
  }
  return { origin: m[1]!, pathname: m[2]!, params };
}

export interface FakeEbayRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

type Injected = { status: number; body?: unknown; headers?: Record<string, string> } | 'network';

const response = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

export function fakeItem(i: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  const used = i % 3 !== 0;
  return {
    itemId: `v1|11000000${String(i).padStart(4, '0')}|0`,
    legacyItemId: `11000000${String(i).padStart(4, '0')}`,
    title: `Apple iPhone 13 ${i % 2 === 0 ? '128GB' : '256GB'} unlocked #${i}`,
    shortDescription: `Phone number ${i}, works perfectly.`,
    price: { value: `${300 + i}.50`, currency: 'USD' },
    buyingOptions: ['FIXED_PRICE'],
    condition: used ? 'Used' : 'New',
    conditionId: used ? '3000' : '1000',
    itemWebUrl: `https://www.ebay.com/itm/11000000${String(i).padStart(4, '0')}`,
    image: { imageUrl: `https://i.ebayimg.com/images/g/${i}/s-l1600.jpg` },
    additionalImages: [{ imageUrl: `https://i.ebayimg.com/images/g/${i}b/s-l1600.jpg` }],
    itemLocation: { city: 'Austin', stateOrProvince: 'Texas', postalCode: '787**', country: 'US' },
    shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: i % 4 === 0 ? '0.00' : '12.99', currency: 'USD' } }],
    seller: { username: `seller${i}`, feedbackPercentage: '99.5', feedbackScore: 1200 + i },
    itemCreationDate: new Date(Date.UTC(2026, 9, 8, 12, 0, 0) - i * 3_600_000).toISOString(),
    ...over,
  };
}

export class FakeEbayServer {
  readonly requests: FakeEbayRequest[] = [];
  readonly items: Record<string, unknown>[];
  tokensIssued = 0;
  private queue: Injected[] = [];
  /** Token lifetime in seconds (eBay: 7200). */
  tokenTtl = 7200;
  /** When true the token endpoint rejects the credentials. */
  rejectCredentials = false;

  constructor(count = 25) {
    this.items = Array.from({ length: count }, (_, i) => fakeItem(i + 1));
  }

  /** The next API (non-token) responses, in order. */
  inject(...responses: Injected[]) {
    this.queue.push(...responses);
  }

  readonly fetch: FetchLike = async (url, init) => {
    this.requests.push({ method: init.method, url, headers: init.headers, body: init.body });
    if (url.endsWith('/identity/v1/oauth2/token')) {
      if (this.rejectCredentials) return response(401, { error: 'invalid_client', error_description: 'client authentication failed' });
      this.tokensIssued += 1;
      return response(200, { access_token: `token-${this.tokensIssued}`, expires_in: this.tokenTtl, token_type: 'Application Access Token' });
    }
    const injected = this.queue.shift();
    if (injected === 'network') throw new Error('ECONNRESET');
    if (injected) return response(injected.status, injected.body ?? { errors: [{ errorId: 1, message: 'injected' }] }, injected.headers);
    if (!init.headers.Authorization?.startsWith('Bearer token-')) return response(401, { errors: [{ errorId: 1001, message: 'Invalid access token' }] });

    const u = parseUrl(url);
    const itemMatch = /\/buy\/browse\/v1\/item\/(.+)$/.exec(u.pathname);
    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]!);
      const item = this.items.find((x) => x.itemId === id);
      return item ? response(200, { ...item, description: '<p>Full <b>HTML</b> description</p>' }) : response(404, { errors: [{ errorId: 11001, message: 'The specified item Id was not found.' }] });
    }
    if (u.pathname === '/buy/browse/v1/item_summary/search') {
      const q = (u.params.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const limit = Number(u.params.get('limit') ?? 50);
      const offset = Number(u.params.get('offset') ?? 0);
      if (limit < 1 || limit > 200 || offset % limit !== 0 || offset > 9999) return response(400, { errors: [{ errorId: 12001, message: 'Invalid limit or offset' }] });
      const filter = u.params.get('filter') ?? '';
      const maxPrice = /price:\[\.\.([\d.]+)\]/.exec(filter)?.[1];
      const conditionIds = /conditionIds:\{([\d|]+)\}/.exec(filter)?.[1]?.split('|');
      const found = this.items.filter(
        (it) =>
          q.every((w) => String(it.title).toLowerCase().includes(w)) &&
          (!maxPrice || Number((it.price as { value: string }).value) <= Number(maxPrice)) &&
          (!conditionIds || conditionIds.includes(String(it.conditionId))),
      );
      const page = found.slice(offset, offset + limit);
      return response(200, {
        href: url,
        total: found.length,
        limit,
        offset,
        ...(offset + limit < found.length ? { next: `${u.origin}${u.pathname}?offset=${offset + limit}&limit=${limit}` } : {}),
        ...(page.length > 0 ? { itemSummaries: page } : {}),
      });
    }
    return response(404, { errors: [{ errorId: 2002, message: 'Resource not found' }] });
  };
}
