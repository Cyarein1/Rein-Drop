import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index.js';

const ID = '01990000-0000-7000-8000-000000000001';
const NOW = '2026-10-07T01:56:03.275Z';
const HUNT = {
  id: ID,
  name: 'Levis',
  query: 'levis 501',
  status: 'DRAFT',
  priority: 'NORMAL',
  marketplaces: ['ebay'],
  location: null,
  conditions: [],
  maxPrice: null,
  target: null,
  exclusions: [],
  createdAt: NOW,
  updatedAt: NOW,
  lastEditedAt: null,
  activatedAt: null,
  pausedAt: null,
  archivedAt: null,
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function client(fetch: ReturnType<typeof fakeFetch>, getHeaders?: () => Record<string, string>) {
  return createApiClient({ baseUrl: 'http://api.test/', fetch: fetch as unknown as typeof globalThis.fetch, getHeaders });
}

describe('createApiClient', () => {
  it('rejects a missing or invalid base URL up front', () => {
    expect(() => createApiClient({ baseUrl: '' })).toThrow(ApiError);
    expect(() => createApiClient({ baseUrl: 'ftp://x' })).toThrow(/http or https/);
  });

  it('sends a validated, trimmed create body and parses the response', async () => {
    const fetch = fakeFetch(201, HUNT);
    const hunt = await client(fetch, () => ({ 'x-test': '1' })).createHunt({
      name: ' Levis ',
      query: 'levis 501',
      marketplaces: ['ebay'],
    });
    expect(hunt).toEqual(HUNT);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/hunts');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Levis',
      query: 'levis 501',
      marketplaces: ['ebay'],
      location: null,
      conditions: [],
      maxPrice: null,
      target: null,
      exclusions: [],
      priority: 'NORMAL',
    });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-test']).toBe('1');
  });

  it('fails client-side validation without calling the API', async () => {
    const fetch = fakeFetch(201, HUNT);
    const err = await client(fetch)
      .createHunt({ name: '', query: 'x', marketplaces: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED', status: undefined });
    expect((err as ApiError).details?.map((d) => d.path)).toEqual(['body.name', 'body.query', 'body.marketplaces']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exposes the structured activation block on ApiError', async () => {
    const block = {
      planCode: 'free',
      reasons: [
        {
          code: 'ACTIVE_HUNT_LIMIT_REACHED',
          message: 'Your plan allows 1 live hunt and 1 is live.',
          limit: 1,
          used: 1,
          resolutions: ['pause_another_hunt', 'upgrade_plan'],
        },
      ],
    };
    const fetch = fakeFetch(409, {
      statusCode: 409,
      code: 'ACTIVATION_BLOCKED',
      message: 'This hunt cannot go live yet',
      activationBlock: block,
      path: `/hunts/${ID}/activate`,
      timestamp: NOW,
    });
    await expect(client(fetch).transitionHunt(ID, 'activate')).rejects.toMatchObject({
      status: 409,
      code: 'ACTIVATION_BLOCKED',
      activationBlock: block,
    });
  });

  it('posts lifecycle actions to /hunts/:id/<action>', async () => {
    const fetch = fakeFetch(200, { ...HUNT, status: 'LIVE', activatedAt: NOW });
    await expect(client(fetch).transitionHunt(ID, 'activate')).resolves.toMatchObject({ status: 'LIVE' });
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/hunts/${ID}/activate`);
    expect(fetch.mock.calls[0]![1]?.method).toBe('POST');
  });

  it('trackEvent posts a catalog-shaped screen event and accepts 204 No Content', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    await expect(client(fetch).trackEvent({ name: 'plan_viewed', properties: { context: 'hunt_activation' } })).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe('http://api.test/telemetry/events');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ name: 'plan_viewed', properties: { context: 'hunt_activation' } });
    // Anything outside the catalog is refused before it leaves the device.
    await expect(client(fetch).trackEvent({ name: 'plan_viewed', properties: { context: 'hunt_activation', title: 'x' } } as never)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('joinWaitlist posts the normalized sign-up to /waitlist; invalid input never leaves the server', async () => {
    const fetch = fakeFetch(202, { status: 'received' });
    await expect(client(fetch).joinWaitlist({ email: ' Sam@Example.com', source: 'landing_waitlist_form', consentVersion: '2026-10-12' })).resolves.toEqual({ status: 'received' });
    expect(fetch.mock.calls[0]![0]).toBe('http://api.test/waitlist');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({ email: 'sam@example.com', requestedMarketplaces: [] });
    await expect(client(fetch).joinWaitlist({ email: 'nope', source: 'landing_waitlist_form', consentVersion: '2026-10-12' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deals: feed query defaults to open; actions hit /deals/:id/<action> with validated bodies', async () => {
    const feed = fakeFetch(200, { items: [], nextCursor: null });
    await client(feed).listDeals({ marketplace: 'ebay' });
    expect(feed.mock.calls[0]![0]).toBe('http://api.test/deals?limit=20&marketplace=ebay&status=open');

    // Response validation fails on the empty body, which is fine: we only check the request here.
    const calls: [string, string, unknown][] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined]);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const c = createApiClient({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
    await Promise.allSettled([
      c.markDealSeen(ID),
      c.saveDeal(ID),
      c.unsaveDeal(ID),
      c.ignoreDeal(ID, { reason: ' too far ' }),
      c.unignoreDeal(ID),
      c.markDealBought(ID, { price: { amountMinor: 350_000, currency: 'ZAR' } }),
    ]);
    expect(calls).toEqual([
      [`http://api.test/deals/${ID}/seen`, 'POST', undefined],
      [`http://api.test/deals/${ID}/save`, 'POST', undefined],
      [`http://api.test/deals/${ID}/save`, 'DELETE', undefined],
      [`http://api.test/deals/${ID}/ignore`, 'POST', { reason: 'too far' }],
      [`http://api.test/deals/${ID}/ignore`, 'DELETE', undefined],
      [`http://api.test/deals/${ID}/bought`, 'POST', { price: { amountMinor: 350_000, currency: 'ZAR' } }],
    ]);
    await expect(c.markDealBought(ID, { price: { amountMinor: 0, currency: 'ZAR' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('inventory: list defaults to holding; writes hit /inventory/:id/... with validated bodies', async () => {
    const page = fakeFetch(200, { items: [], nextCursor: null });
    await client(page).listInventory();
    expect(page.mock.calls[0]![0]).toBe('http://api.test/inventory?status=holding&limit=50');

    const calls: [string, string, unknown][] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined]);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const c = createApiClient({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
    const zar = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
    const soldAt = '2026-10-01T10:00:00.000Z';
    await Promise.allSettled([
      c.updateInventoryItem(ID, { status: 'LISTED' }),
      c.replacePurchaseCosts(ID, { costs: [{ category: 'TAX', amount: zar(100) }] }),
      c.recordSale(ID, { price: zar(500), soldAt }),
      c.undoSale(ID),
    ]);
    expect(calls).toEqual([
      [`http://api.test/inventory/${ID}`, 'PATCH', { status: 'LISTED' }],
      [`http://api.test/inventory/${ID}/purchase-costs`, 'PUT', { costs: [{ category: 'TAX', amount: zar(100) }] }],
      [`http://api.test/inventory/${ID}/sale`, 'PUT', { price: zar(500), soldAt, marketplace: null, costs: [] }],
      [`http://api.test/inventory/${ID}/sale`, 'DELETE', undefined],
    ]);
    await expect(c.recordSale(ID, { price: zar(0), soldAt })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(c.updateInventoryItem(ID, {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('analytics: each view hits /analytics/<view> with the period (default 30d), validated', async () => {
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const c = createApiClient({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
    await Promise.allSettled([
      c.getAnalyticsOverview(),
      c.getHuntAnalytics({ period: '7d' }),
      c.getProductAnalytics({ period: '90d' }),
      c.getMarketplaceAnalytics({ period: '365d' }),
      c.getMissedPotential({ period: 'all' }),
    ]);
    expect(urls).toEqual([
      'http://api.test/analytics/overview?period=30d',
      'http://api.test/analytics/hunts?period=7d',
      'http://api.test/analytics/products?period=90d',
      'http://api.test/analytics/marketplaces?period=365d',
      'http://api.test/analytics/missed?period=all',
    ]);
    await expect(c.getAnalyticsOverview({ period: 'forever' as '7d' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('notifications: inbox query, read actions and validated preference changes', async () => {
    const inbox = fakeFetch(200, { items: [], nextCursor: null, unreadCount: 3 });
    await expect(client(inbox).listAlerts({ unreadOnly: 'true' })).resolves.toMatchObject({ unreadCount: 3 });
    expect(inbox.mock.calls[0]![0]).toBe('http://api.test/alerts?limit=20&unreadOnly=true');

    const read = fakeFetch(200, { updated: 2 });
    await expect(client(read).markAllAlertsRead()).resolves.toEqual({ updated: 2 });
    expect([read.mock.calls[0]![0], read.mock.calls[0]![1]?.method]).toEqual(['http://api.test/alerts/read-all', 'POST']);

    const prefs = fakeFetch(200, { categories: [] });
    await client(prefs).updateNotificationPreferences({ changes: [{ category: 'marketing', channel: 'EMAIL', enabled: true }] });
    expect(prefs.mock.calls[0]![1]?.method).toBe('PATCH');
    // The in-app inbox can't be switched off for deal alerts - refused before any request.
    const refused = fakeFetch(200, { categories: [] });
    await expect(
      client(refused).updateNotificationPreferences({ changes: [{ category: 'deal_alerts', channel: 'IN_APP', enabled: false }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(refused).not.toHaveBeenCalled();
  });

  it('serializes list queries with defaults', async () => {
    const fetch = fakeFetch(200, { items: [HUNT], nextCursor: null });
    const page = await client(fetch).listHunts({ status: 'LIVE' });
    expect(page.items).toHaveLength(1);
    expect(fetch.mock.calls[0]![0]).toBe('http://api.test/hunts?limit=20&status=LIVE');
  });

  it('maps the standard API error body to ApiError', async () => {
    const fetch = fakeFetch(404, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Hunt not found',
      requestId: 'r-1',
      path: `/hunts/${ID}`,
      timestamp: NOW,
    });
    await expect(client(fetch).getHunt(ID)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Hunt not found',
      requestId: 'r-1',
    });
  });

  it('rejects responses that do not match the contract', async () => {
    const fetch = fakeFetch(200, { ...HUNT, status: 'DELETED' });
    await expect(client(fetch).getHunt(ID)).rejects.toThrow(/does not match the contract/);
  });

  it('PATCHes a validated Seller Snapshot answer to /me/seller-snapshot', async () => {
    const snapshot = {
      isReseller: true,
      status: 'in_progress',
      categories: [],
      categoriesOther: null,
      stage: 'side_income',
      sources: [],
      sourcesOther: null,
      dealRule: null,
      improvementGoal: null,
      completedAt: null,
      updatedAt: NOW,
    };
    const fetch = fakeFetch(200, snapshot);
    await expect(client(fetch).updateSellerSnapshot({ stage: 'side_income' })).resolves.toEqual(snapshot);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/me/seller-snapshot');
    expect(init?.method).toBe('PATCH');

    const err = await client(fetch)
      .updateSellerSnapshot({ categories: ['gaming'], categoriesOther: 'Vinyl' })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats 503 from /ready as a normal readiness response', async () => {
    const fetch = fakeFetch(503, { status: 'not_ready', checks: { database: 'down' }, timestamp: NOW });
    await expect(client(fetch).getReadiness()).resolves.toMatchObject({ status: 'not_ready' });
  });

  it('wraps network failures', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client(fetch as never).getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      status: undefined,
      message: 'GET /health failed: fetch failed',
    });
  });
});

describe('item lifecycle and account deletion (step 90)', () => {
  it('sends x-client-platform and the account-deletion confirmation', async () => {
    const fetch = fakeFetch(200, { deleted: true, deletedAt: NOW, canceledSubscriptions: 1, signOut: true });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch, platform: 'mobile', getHeaders: () => ({ 'x-test': '1' }) });
    expect(await api.deleteAccount()).toMatchObject({ deleted: true, canceledSubscriptions: 1 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/me/delete');
    expect(JSON.parse(String(init?.body))).toEqual({ confirmation: 'DELETE' });
    expect(init?.headers).toMatchObject({ 'x-client-platform': 'mobile', 'x-test': '1' });
  });

  it('lists Sell tabs by view and validates lifecycle bodies before sending', async () => {
    const fetch = fakeFetch(200, { items: [] });
    const api = client(fetch);
    await api.listSellListings({ view: 'discarded' });
    await api.listSellListings('DRAFT');
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual(['http://api.test/sell/listings?view=discarded', 'http://api.test/sell/listings?status=DRAFT']);
    await expect(api.returnInventoryItem(ID, { refund: { amountMinor: -1, currency: 'ZAR' } })).rejects.toThrow(ApiError);
    await expect(api.createInventoryItem({ title: '', purchasePrice: { amountMinor: 1, currency: 'ZAR' }, purchasedAt: NOW })).rejects.toThrow(ApiError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
