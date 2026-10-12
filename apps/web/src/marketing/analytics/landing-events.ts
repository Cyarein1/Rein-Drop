import { DEMO_PRODUCTS, type DemoProductKey } from "../demo/demo-fixtures";
import { REQUESTABLE_MARKETPLACES } from "../marketplaces/marketplace-interest";

/**
 * Landing analytics events (Landing 21) - the complete catalog. Every property is a value from a
 * fixed list (or a small bounded number), so nothing a visitor types - email, the "Other" name -
 * and no identifier, IP or timestamp can ever be sent. Anything not in the catalog is dropped.
 */

const DEMO_KEYS = DEMO_PRODUCTS.map((p) => p.key) as readonly DemoProductKey[];
const REQUEST_KEYS = [...REQUESTABLE_MARKETPLACES, "other"] as const;

export const LANDING_EVENTS = {
  /** A hero call to action was used. */
  hero_cta_clicked: { cta: ["join_early_access", "see_how_it_works"] },
  /** The demo began: a product was chosen. */
  demo_started: { product: DEMO_KEYS },
  /** The demo reached its deal explanation. */
  demo_completed: { product: DEMO_KEYS },
  /** A marketplace (or "other") was requested - the key only, never the typed name. */
  marketplace_requested: { marketplace: REQUEST_KEYS },
  /** The early-access sign-up was accepted. `requested` = how many marketplaces were picked (0-16). */
  waitlist_succeeded: { requested: "count" },
} as const satisfies Record<string, Record<string, readonly string[] | "count">>;

export type LandingEventName = keyof typeof LANDING_EVENTS;
export type LandingEventProps<N extends LandingEventName> = {
  [K in keyof (typeof LANDING_EVENTS)[N]]: (typeof LANDING_EVENTS)[N][K] extends readonly (infer V)[] ? V : number;
};

const MAX_COUNT = 16;

/**
 * Returns the event's properties reduced to exactly the catalog, or null if anything doesn't fit
 * (unknown event, missing / unknown property, value not on the list, count out of range).
 */
export function sanitizeLandingEvent(name: string, props: unknown): Record<string, string | number> | null {
  const spec = (LANDING_EVENTS as Record<string, Record<string, readonly string[] | "count">>)[name];
  if (!spec || typeof props !== "object" || props === null || Array.isArray(props)) return null;
  const input = props as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const [key, allowed] of Object.entries(spec)) {
    const value = input[key];
    if (allowed === "count") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_COUNT) return null;
    } else if (typeof value !== "string" || !allowed.includes(value)) {
      return null;
    }
    out[key] = value;
  }
  return out;
}
