import "server-only";
import { joinWaitlistRequestSchema, type JoinWaitlistRequest } from "@rein-drop/contracts";

/**
 * POST /api/waitlist (Landing 19) - the landing page's early-access sign-up, handled on the web
 * SERVER (never in the browser bundle). Decision L-D3: the web app holds no database credentials;
 * after its own checks it forwards to the NestJS API (`POST /waitlist`), the only database writer.
 *
 * Defences, in order: same-origin check, JSON only, per-visitor rate limit, body size limit,
 * honeypot, shared zod schema (email normalized). Responses never echo input and never reveal
 * whether an address was already on the list; logs never contain the email, the "other" name or
 * the visitor's IP.
 */

/** Per visitor (client IP): plenty for a person correcting a typo, useless for a script. */
export const WAITLIST_RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 };
/** A sign-up is a few hundred bytes. */
export const WAITLIST_MAX_BODY_BYTES = 4096;
/** Hidden form field real people never fill in (the form in Landing 20 renders it off-screen). */
export const WAITLIST_HONEYPOT_FIELD = "website";

export type WaitlistErrorCode = "INVALID" | "RATE_LIMITED" | "FORBIDDEN" | "UNSUPPORTED" | "TOO_LARGE" | "UNAVAILABLE";

export interface WaitlistReceived {
  status: "received";
}

export interface WaitlistError {
  status: "error";
  code: WaitlistErrorCode;
  /** Plain words for the visitor; never contains what they typed. */
  message: string;
  /** Which fields to fix (INVALID only): field names + fixed messages from the contract. */
  fields?: { field: string; message: string }[];
}

const MESSAGES: Record<WaitlistErrorCode, string> = {
  INVALID: "Please check the highlighted fields.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  FORBIDDEN: "This sign-up form only works on the Rein Drop site.",
  UNSUPPORTED: "Send the sign-up as JSON.",
  TOO_LARGE: "That sign-up is too large.",
  UNAVAILABLE: "We couldn't save your sign-up just now. Please try again in a moment.",
};

/** What the API answered, reduced to what this route needs (no error text is passed through). */
export type ForwardResult = { ok: true } | { ok: false; status?: number };

export interface WaitlistRouteDeps {
  /** Sends the validated sign-up to the API (server-to-server). */
  forward: (signup: JoinWaitlistRequest) => Promise<ForwardResult>;
  limiter: RateLimiter;
  /** One structured line per request; never given the email, the "other" name or the IP. */
  log: (entry: WaitlistLogEntry) => void;
}

export interface WaitlistLogEntry {
  event: "waitlist_request";
  outcome: "received" | "honeypot" | "invalid" | "rate_limited" | "forbidden" | "unsupported" | "too_large" | "api_rejected" | "api_unavailable";
  status: number;
  /** Field names only, for invalid requests. */
  fields?: string[];
  apiStatus?: number;
}

// ---------------------------------------------------------------------------
// Rate limiting (in memory - fine for one web instance; several need a shared store, OUTSTANDING)
// ---------------------------------------------------------------------------

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = WAITLIST_RATE_LIMIT.limit,
    private readonly windowMs = WAITLIST_RATE_LIMIT.windowMs,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one attempt; returns the seconds to wait when over the limit, else null. */
  take(key: string): number | null {
    const now = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : null;
  }
}

/**
 * The visitor's IP. Behind the hosting ingress (one trusted proxy) the RIGHTMOST X-Forwarded-For
 * entry is the address that proxy saw - earlier entries can be forged by the client. Without the
 * header (local development) everyone shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Browsers send Origin on cross-site POSTs: only this site's own pages may submit. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser callers: still limited, validated and forwarded like anyone.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const json = (body: WaitlistReceived | WaitlistError, status: number, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });

const fail = (code: WaitlistErrorCode, status: number, fields?: WaitlistError["fields"], extra?: Record<string, string>) =>
  json({ status: "error", code, message: MESSAGES[code], ...(fields ? { fields } : {}) }, status, extra);

export function createWaitlistHandler(deps: WaitlistRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    const done = (outcome: WaitlistLogEntry["outcome"], response: Response, extra: Partial<WaitlistLogEntry> = {}) => {
      deps.log({ event: "waitlist_request", outcome, status: response.status, ...extra });
      return response;
    };

    if (!sameOrigin(request)) return done("forbidden", fail("FORBIDDEN", 403));
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return done("unsupported", fail("UNSUPPORTED", 415));
    }

    const wait = deps.limiter.take(clientIp(request.headers));
    if (wait !== null) return done("rate_limited", fail("RATE_LIMITED", 429, undefined, { "Retry-After": String(wait) }));

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > WAITLIST_MAX_BODY_BYTES) return done("too_large", fail("TOO_LARGE", 413));
    const text = await request.text();
    if (new TextEncoder().encode(text).length > WAITLIST_MAX_BODY_BYTES) return done("too_large", fail("TOO_LARGE", 413));

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return done("invalid", fail("INVALID", 400));
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return done("invalid", fail("INVALID", 400));

    // Honeypot: a bot filled the hidden field. Answer exactly like a success, store nothing.
    const trap = (body as Record<string, unknown>)[WAITLIST_HONEYPOT_FIELD];
    if (typeof trap === "string" ? trap.trim() !== "" : trap !== undefined && trap !== null) {
      return done("honeypot", json({ status: "received" }, 202));
    }

    const parsed = joinWaitlistRequestSchema.safeParse(body);
    if (!parsed.success) {
      const fields = [...new Map(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])).entries()].map(([field, message]) => ({ field, message }));
      return done("invalid", fail("INVALID", 400, fields), { fields: fields.map((f) => f.field) });
    }

    let result: ForwardResult;
    try {
      result = await deps.forward(parsed.data);
    } catch {
      result = { ok: false };
    }
    if (result.ok) return done("received", json({ status: "received" }, 202));
    // The API re-validates with the same schema, so a 400 here means the two disagree: say "check
    // the form" without passing the API's text on. Its 429 is the site-wide ceiling.
    if (result.status === 400) return done("api_rejected", fail("INVALID", 400), { apiStatus: 400 });
    if (result.status === 429) return done("rate_limited", fail("RATE_LIMITED", 429, undefined, { "Retry-After": "60" }), { apiStatus: 429 });
    return done("api_unavailable", fail("UNAVAILABLE", 503), result.status ? { apiStatus: result.status } : {});
  };
}
