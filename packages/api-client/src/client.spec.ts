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

  it('posts lifecycle actions to /hunts/:id/<action>', async () => {
    const fetch = fakeFetch(200, { ...HUNT, status: 'LIVE', activatedAt: NOW });
    await expect(client(fetch).transitionHunt(ID, 'activate')).resolves.toMatchObject({ status: 'LIVE' });
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/hunts/${ID}/activate`);
    expect(fetch.mock.calls[0]![1]?.method).toBe('POST');
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
