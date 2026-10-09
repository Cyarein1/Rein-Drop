import { describe, expect, it, vi } from 'vitest';
import {
  createProductEventProvider,
  LogProductEventProvider,
  MemoryProductEventProvider,
  NoopProductEventProvider,
  ProductEvents,
  resolveProductEventProviderId,
  type ProductEventProvider,
} from './index.js';

const USER = '01920000-0000-7000-8000-0000000000aa';
const DEAL = '01920000-0000-7000-8000-0000000000bb';
const NOW = new Date('2026-10-09T10:00:00.000Z');

function setup(provider: ProductEventProvider = new MemoryProductEventProvider()) {
  const problems: string[] = [];
  const events = new ProductEvents(provider, { source: 'api', clock: () => NOW, onProblem: (m) => problems.push(m) });
  return { events, problems, provider };
}

describe('ProductEvents', () => {
  it('sends a valid event with the envelope (name, internal id, time, source)', () => {
    const memory = new MemoryProductEventProvider();
    const { events, problems } = setup(memory);
    events.track('deal_saved', USER, { dealId: DEAL });
    expect(memory.events).toEqual([{ name: 'deal_saved', distinctId: USER, occurredAt: NOW.toISOString(), source: 'api', properties: { dealId: DEAL } }]);
    expect(problems).toEqual([]);
  });

  it('drops an event carrying anything the catalog does not allow - and never reports the value', () => {
    const memory = new MemoryProductEventProvider();
    const { events, problems } = setup(memory);
    // A careless call site passing a listing title must not leak it.
    events.track('deal_saved', USER, { dealId: DEAL, title: 'Nintendo Switch OLED' } as never);
    events.track('deal_ignored', USER, { dealId: DEAL, hasReason: true, reason: 'seller seems dodgy' } as never);
    expect(memory.events).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).not.toMatch(/Nintendo|dodgy/);
    expect(problems[0]).toContain('deal_saved');
  });

  it('drops events for anything but an internal user id (e.g. an email)', () => {
    const memory = new MemoryProductEventProvider();
    const { events, problems } = setup(memory);
    events.track('onboarding_started', 'someone@example.com', {});
    expect(memory.events).toEqual([]);
    expect(problems.join(' ')).not.toContain('someone@example.com');
  });

  it('never throws or rejects into the caller when the provider fails', async () => {
    const throwing: ProductEventProvider = { id: 'broken', capture: () => { throw new Error('boom'); } };
    const rejecting: ProductEventProvider = { id: 'down', capture: () => Promise.reject(new Error('network down')) };
    const a = setup(throwing);
    const b = setup(rejecting);
    expect(() => a.events.track('deal_saved', USER, { dealId: DEAL })).not.toThrow();
    expect(() => b.events.track('deal_saved', USER, { dealId: DEAL })).not.toThrow();
    for (let i = 0; i < 3; i++) await Promise.resolve(); // let the rejection handler run
    expect(a.problems).toEqual(['product event "deal_saved" not sent: boom']);
    expect(b.problems).toEqual(['product event "deal_saved" not sent: network down']);
  });
});

describe('providers', () => {
  it('log writes one structured line per event', () => {
    const log = vi.fn();
    const { events } = setup(new LogProductEventProvider(log, 'json'));
    events.track('plan_selected', USER, { planCode: 'free', method: 'free' });
    expect(log).toHaveBeenCalledWith({
      event: 'product_event',
      name: 'plan_selected',
      distinctId: USER,
      occurredAt: NOW.toISOString(),
      source: 'api',
      properties: { planCode: 'free', method: 'free' },
    });
    const text = vi.fn();
    setup(new LogProductEventProvider(text, 'text')).events.track('deal_opened', USER, { dealId: DEAL, firstOpen: false });
    expect(text).toHaveBeenCalledWith(`product_event deal_opened user=${USER} {"dealId":"${DEAL}","firstOpen":false}`);
  });

  it('config: log by default, none switches it off', () => {
    expect(resolveProductEventProviderId({})).toBe('log');
    expect(createProductEventProvider('log', () => undefined, 'json')).toBeInstanceOf(LogProductEventProvider);
    expect(createProductEventProvider(resolveProductEventProviderId({ PRODUCT_EVENTS_PROVIDER: 'none' }), () => undefined, 'json')).toBeInstanceOf(NoopProductEventProvider);
  });
});
