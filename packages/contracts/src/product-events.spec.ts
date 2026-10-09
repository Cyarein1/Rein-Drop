import { describe, expect, it } from 'vitest';
import { CLIENT_PRODUCT_EVENT_NAMES, clientProductEventRequestSchema, PRODUCT_EVENT_NAMES, productEventPropertiesSchemas } from './index.js';

const ID = '01920000-0000-7000-8000-000000000001';

/** A valid property set for every event (the catalog the prompt asks for). */
const VALID = {
  onboarding_started: {},
  onboarding_completed: {},
  hunt_created: { huntId: ID, marketplaces: ['ebay', 'facebook'], hasMaxPrice: true, hasTarget: false },
  hunt_activated: { huntId: ID, planCode: 'free' },
  deal_alerted: { dealId: ID, huntId: ID, kind: 'exceptional', marketplace: 'ebay' },
  deal_opened: { dealId: ID, firstOpen: true },
  deal_saved: { dealId: ID },
  deal_ignored: { dealId: ID, hasReason: true },
  deal_bought: { dealId: ID, marketplace: 'facebook', strength: null },
  sale_recorded: { inventoryItemId: ID, fromDeal: true, result: 'profit', daysHeld: 3 },
  plan_viewed: { context: 'hunt_activation' },
  plan_selected: { planCode: 'pro', method: 'checkout' },
  cancellation: { planCode: 'pro', kind: 'scheduled' },
} as const;

/** What must never leave Rein Drop in an event. */
const FORBIDDEN = {
  title: 'Nintendo Switch OLED - like new',
  url: 'https://www.ebay.com/itm/123',
  email: 'someone@example.com',
  price: { amountMinor: 400_000, currency: 'ZAR' },
  reason: 'seller seems dodgy',
  location: 'Cape Town',
};

describe('product event catalog', () => {
  it('covers exactly the beta events', () => {
    expect(PRODUCT_EVENT_NAMES.sort()).toEqual(Object.keys(VALID).sort());
    expect(PRODUCT_EVENT_NAMES).toEqual(
      expect.arrayContaining(['onboarding_started', 'onboarding_completed', 'hunt_created', 'hunt_activated', 'deal_alerted', 'deal_opened', 'deal_saved', 'deal_ignored', 'deal_bought', 'sale_recorded', 'plan_viewed', 'plan_selected', 'cancellation']),
    );
  });

  it.each(PRODUCT_EVENT_NAMES)('%s accepts its documented properties', (name) => {
    expect(productEventPropertiesSchemas[name].safeParse(VALID[name]).success).toBe(true);
  });

  it.each(PRODUCT_EVENT_NAMES)('%s rejects any extra property (titles, URLs, email, money, free text)', (name) => {
    for (const [key, value] of Object.entries(FORBIDDEN)) {
      const result = productEventPropertiesSchemas[name].safeParse({ ...VALID[name], [key]: value });
      expect(result.success, `${name}.${key}`).toBe(false);
    }
  });

  it('identifies records by internal id only', () => {
    expect(productEventPropertiesSchemas.deal_saved.safeParse({ dealId: 'https://www.ebay.com/itm/123' }).success).toBe(false);
    expect(productEventPropertiesSchemas.hunt_activated.safeParse({ huntId: ID, planCode: 'Pro Plan with spaces' }).success).toBe(false);
  });
});

describe('client product events', () => {
  it('only accepts events the apps can observe', () => {
    expect(CLIENT_PRODUCT_EVENT_NAMES).toEqual(['plan_viewed']);
    expect(clientProductEventRequestSchema.safeParse({ name: 'plan_viewed', properties: { context: 'hunt_activation' } }).success).toBe(true);
    // Server-owned events can't be reported (or forged) by a client.
    expect(clientProductEventRequestSchema.safeParse({ name: 'deal_bought', properties: VALID.deal_bought }).success).toBe(false);
    expect(clientProductEventRequestSchema.safeParse({ name: 'plan_viewed', properties: { context: 'hunt_activation', email: FORBIDDEN.email } }).success).toBe(false);
    expect(clientProductEventRequestSchema.safeParse({ name: 'plan_viewed', properties: { context: 'hunt_activation' }, distinctId: ID }).success).toBe(false);
  });
});
