import { ExpoPushProvider } from './expo-push-provider.js';
import { maskToken } from './simulated-push-provider.js';
import type { PushMessage } from './push-provider.js';

const message = (n: number): PushMessage => ({ to: `ExponentPushToken[t${n}]`, title: 'Strong deal: iPhone 13', body: null, data: { alertId: 'a' }, channelId: 'alerts' });

function fakeFetch(reply: (body: unknown[]) => Response | Promise<Response>) {
  const calls: { url: string; headers: Record<string, string>; body: unknown[] }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as unknown[];
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body });
    return reply(body);
  }) as typeof fetch;
  return { fn, calls };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

describe('ExpoPushProvider', () => {
  it('posts to the Expo push service and maps tickets (ok, DeviceNotRegistered, rate limit, unknown)', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({
        data: [
          { status: 'ok', id: 'XXXX' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
          { status: 'error', message: '?' },
        ],
      }),
    );
    const tickets = await new ExpoPushProvider({ fetch: fn }).send([1, 2, 3, 4].map(message));
    expect(tickets).toEqual([
      { status: 'ok', id: 'XXXX' },
      { status: 'error', code: 'device_not_registered', message: 'gone', retryable: false },
      { status: 'error', code: 'rate_limited', message: 'slow down', retryable: true },
      { status: 'error', code: 'other', message: '?', retryable: false },
    ]);
    expect(calls[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(calls[0]!.body[0]).toEqual({ to: 'ExponentPushToken[t1]', title: 'Strong deal: iPhone 13', data: { alertId: 'a' }, sound: 'default', priority: 'high', channelId: 'alerts' });
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it('sends the access token when configured and batches by 100', async () => {
    const { fn, calls } = fakeFetch((body) => json({ data: body.map(() => ({ status: 'ok', id: 'x' })) }));
    const tickets = await new ExpoPushProvider({ fetch: fn, accessToken: 'secret' }).send(Array.from({ length: 150 }, (_, i) => message(i)));
    expect(tickets).toHaveLength(150);
    expect(calls.map((c) => c.body.length)).toEqual([100, 50]);
    expect(calls[0]!.headers.authorization).toBe('Bearer secret');
  });

  it('turns outages into retryable errors and auth failures into permanent ones', async () => {
    const send = async (fn: typeof fetch) => (await new ExpoPushProvider({ fetch: fn }).send([message(1)]))[0];
    expect(await send(fakeFetch(() => json({}, 503)).fn)).toMatchObject({ code: 'unavailable', retryable: true });
    expect(await send(fakeFetch(() => json({}, 429)).fn)).toMatchObject({ code: 'rate_limited', retryable: true });
    expect(await send(fakeFetch(() => json({}, 401)).fn)).toMatchObject({ code: 'invalid_credentials', retryable: false });
    expect(await send((async () => Promise.reject(new Error('ECONNRESET'))) as typeof fetch)).toMatchObject({ code: 'unavailable', retryable: true });
    expect(await send(fakeFetch(() => new Response('<html>', { status: 200 })).fn)).toMatchObject({ code: 'unavailable', retryable: true });
    expect(await send(fakeFetch(() => json({ errors: [{ message: 'bad request' }] })).fn)).toMatchObject({ code: 'other', message: expect.stringContaining('bad request') });
  });
});

describe('Expo push receipts', () => {
  it('asks for receipts in batches of up to 1000 and maps them (ok, DeviceNotRegistered, not ready yet = absent)', async () => {
    const { fn, calls } = fakeFetch((body) => {
      const ids = (body as unknown as { ids: string[] }).ids;
      return json({ data: Object.fromEntries(ids.filter((id) => id !== 'pending').map((id) => [id, id === 'dead' ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }])) });
    });
    const ids = ['ok-1', 'dead', 'pending', ...Array.from({ length: 1000 }, (_, i) => `more-${i}`)];
    const receipts = await new ExpoPushProvider({ fetch: fn, accessToken: 'secret' }).getReceipts(ids);
    expect(calls.map((c) => c.url)).toEqual(['https://exp.host/--/api/v2/push/getReceipts', 'https://exp.host/--/api/v2/push/getReceipts']);
    expect(calls[0]!.headers.authorization).toBe('Bearer secret');
    expect(receipts.get('ok-1')).toEqual({ status: 'ok' });
    expect(receipts.get('dead')).toEqual({ status: 'error', code: 'device_not_registered', message: 'gone' });
    expect(receipts.has('pending')).toBe(false);
    expect(receipts.size).toBe(1002);
  });

  it('an outage throws, so the maintenance loop simply asks again later', async () => {
    const { fn } = fakeFetch(() => json({}, 503));
    await expect(new ExpoPushProvider({ fetch: fn }).getReceipts(['x'])).rejects.toThrow('Expo receipts HTTP 503');
  });
});

describe('simulated push log', () => {
  it('masks device tokens (a push token is enough to send to that phone)', () => {
    expect(maskToken('ExponentPushToken[abcdefghijklmnop]')).toBe('…lmnop]');
    expect(maskToken('dev-simulated:01990000-0000-7000-8000-000000000001')).toBe('…000001');
  });
});
