import { z } from 'zod';
import { idSchema, marketplaceKeySchema } from './common.js';
import { dealStrengthSchema } from './deals.js';

/**
 * Product events (beta telemetry, Build Prompt 43): the catalog of what Rein Drop measures about
 * how the product is used, and EXACTLY which properties each event may carry.
 *
 * Privacy by construction - every property schema is strict (unknown keys are rejected), so an
 * event can never carry more than listed here:
 * - no marketplace payloads: no listing titles, descriptions, URLs, photos, seller names, locations;
 * - no money amounts (prices, costs, profit) and no free text the user typed (ignore reasons, notes,
 *   hunt queries / names);
 * - no personal data: no email, name, IP address or device details. The person is identified only
 *   by the internal user id (an opaque UUID), and records only point at internal ids.
 * Events are recorded by the server when the state actually changes (once per change, never for a
 * repeated or failed request). Only the events in CLIENT_PRODUCT_EVENT_NAMES come from the apps.
 */

const planCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);

export const productEventPropertiesSchemas = {
  /** First Seller Snapshot answer saved (the profile is created). */
  onboarding_started: z.strictObject({}),
  /** The fifth Seller Snapshot answer completed the profile (once per user). */
  onboarding_completed: z.strictObject({}),
  hunt_created: z.strictObject({
    huntId: idSchema,
    marketplaces: z.array(marketplaceKeySchema).max(10),
    hasMaxPrice: z.boolean(),
    hasTarget: z.boolean(),
  }),
  /** DRAFT -> LIVE, passed the plan gate. */
  hunt_activated: z.strictObject({ huntId: idSchema, planCode: planCodeSchema }),
  /** The worker created the deal's alert (at most once per deal). */
  deal_alerted: z.strictObject({
    dealId: idSchema,
    huntId: idSchema,
    kind: z.enum(['deal', 'exceptional']),
    marketplace: marketplaceKeySchema,
  }),
  /** Deal detail opened; firstOpen = it was still NEW. */
  deal_opened: z.strictObject({ dealId: idSchema, firstOpen: z.boolean() }),
  deal_saved: z.strictObject({ dealId: idSchema }),
  /** hasReason only - the reason text itself is never sent. */
  deal_ignored: z.strictObject({ dealId: idSchema, hasReason: z.boolean() }),
  deal_bought: z.strictObject({ dealId: idSchema, marketplace: marketplaceKeySchema, strength: dealStrengthSchema.nullable() }),
  /** A holding item marked sold (corrections of a recorded sale are not counted again). */
  sale_recorded: z.strictObject({
    inventoryItemId: idSchema,
    fromDeal: z.boolean(),
    /** Direction only - never amounts. */
    result: z.enum(['profit', 'loss', 'break_even', 'unavailable']),
    daysHeld: z.number().int().nonnegative().max(36_500),
  }),
  /** The plan gate was shown. */
  plan_viewed: z.strictObject({ context: z.enum(['hunt_activation']) }),
  /** free = chose Free; checkout = started a paid checkout; development = development fake. */
  plan_selected: z.strictObject({ planCode: planCodeSchema, method: z.enum(['free', 'checkout', 'development']) }),
  /** A paid plan was cancelled: scheduled for the period end, or ended now. */
  cancellation: z.strictObject({ planCode: planCodeSchema, kind: z.enum(['scheduled', 'ended']) }),
} as const;

export type ProductEventName = keyof typeof productEventPropertiesSchemas;
export const PRODUCT_EVENT_NAMES = Object.keys(productEventPropertiesSchemas) as ProductEventName[];
export type ProductEventProperties<N extends ProductEventName> = z.infer<(typeof productEventPropertiesSchemas)[N]>;

/** Where an event was recorded. */
export const PRODUCT_EVENT_SOURCES = ['api', 'worker'] as const;
export type ProductEventSource = (typeof PRODUCT_EVENT_SOURCES)[number];

/** One recorded event, as handed to a ProductEventProvider. */
export interface ProductEvent<N extends ProductEventName = ProductEventName> {
  name: N;
  /** Internal user id (opaque UUID) - never an email or name. */
  distinctId: string;
  occurredAt: string;
  source: ProductEventSource;
  properties: ProductEventProperties<N>;
}

// ---------------------------------------------------------------------------
// Client-reported events (`POST /telemetry/events`)
// ---------------------------------------------------------------------------

/** Events only the apps can observe (a screen being shown). Everything else is recorded server-side. */
export const CLIENT_PRODUCT_EVENT_NAMES = ['plan_viewed'] as const satisfies readonly ProductEventName[];
export type ClientProductEventName = (typeof CLIENT_PRODUCT_EVENT_NAMES)[number];

export const clientProductEventRequestSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('plan_viewed'), properties: productEventPropertiesSchemas.plan_viewed }),
]);
export type ClientProductEventRequest = z.infer<typeof clientProductEventRequestSchema>;
