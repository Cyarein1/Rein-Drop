import { sanitizeLandingEvent, type LandingEventName, type LandingEventProps } from "./landing-events";

/**
 * Landing analytics adapter (Landing 21). Lightweight, write-only and anonymous:
 * - Events come only from the catalog (landing-events.ts); properties are sanitized to fixed values.
 * - No cookies, storage, identifiers, IPs or timestamps are added here.
 * - Nothing is ever read back, so nothing on the page can show a count (no fake counters).
 * - Visitors who send Global Privacy Control or Do Not Track are never tracked.
 * - A provider that needs consent (it sets cookies / identifiers) only runs once consent has been
 *   given. There is no consent banner yet, so such a provider would stay off - by design.
 *
 * Provider: NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER (inlined at build time). Default: "console" in
 * development, "none" in production until a real provider is chosen and added to PROVIDERS.
 */

export interface AnalyticsProvider {
  id: string;
  /** True if the provider sets cookies or identifiers - then it needs the visitor's consent first. */
  requiresConsent: boolean;
  send(name: LandingEventName, props: Record<string, string | number>): void;
}

const consoleProvider: AnalyticsProvider = {
  id: "console",
  requiresConsent: false,
  send: (name, props) => console.info("[landing-analytics]", name, props),
};

const noneProvider: AnalyticsProvider = { id: "none", requiresConsent: false, send: () => undefined };

/**
 * Known providers. A production provider is added here later (TODO(product): choose one - prefer a
 * cookieless, EU-hosted service; set requiresConsent honestly).
 */
export const PROVIDERS: Record<string, AnalyticsProvider> = { console: consoleProvider, none: noneProvider };

export function resolveProvider(configured: string | undefined, nodeEnv: string | undefined): AnalyticsProvider {
  const id = configured?.trim().toLowerCase() || (nodeEnv === "production" ? "none" : "console");
  return PROVIDERS[id] ?? noneProvider; // unknown names never fall back to sending somewhere
}

/** The visitor's browser asks not to be tracked (Global Privacy Control or Do Not Track). */
export function privacySignal(nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null } | undefined): boolean {
  if (!nav) return false;
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.doNotTrack === "yes";
}

export interface AnalyticsContext {
  provider: AnalyticsProvider;
  /** From the browser; true = never track. */
  optedOut: boolean;
  /** Consent for consent-requiring providers. No consent UI exists yet, so always false today. */
  consented: boolean;
}

/** Sends one event if allowed. Returns what happened (for tests); callers ignore it. */
export function trackWith(ctx: AnalyticsContext, name: LandingEventName, props: unknown): "sent" | "opted_out" | "no_consent" | "invalid" | "failed" {
  if (ctx.optedOut) return "opted_out";
  if (ctx.provider.requiresConsent && !ctx.consented) return "no_consent";
  const clean = sanitizeLandingEvent(name, props);
  if (!clean) return "invalid";
  try {
    ctx.provider.send(name, clean);
    return "sent";
  } catch {
    return "failed"; // analytics must never break the page
  }
}

function browserContext(): AnalyticsContext {
  const provider = resolveProvider(process.env.NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER, process.env.NODE_ENV);
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { globalPrivacyControl?: boolean });
  return { provider, optedOut: privacySignal(nav), consented: false };
}

/** The one call sites use. Client-side only (no-op during server rendering). */
export function trackLanding<N extends LandingEventName>(name: N, props: LandingEventProps<N>): void {
  if (typeof window === "undefined") return;
  trackWith(browserContext(), name, props);
}
