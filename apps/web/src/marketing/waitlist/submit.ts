import { WAITLIST_CONSENT_VERSION, WAITLIST_SOURCE } from "./consent";

/**
 * Sends the early-access form to POST /api/waitlist (Landing 20) and turns every answer into one of
 * a few outcomes the form can show. Pure apart from `fetch`, so it is unit-tested.
 */

export interface WaitlistFormValues {
  email: string;
  requestedMarketplaces: string[];
  requestedMarketplaceOther: string | null;
  /** Honeypot: real people leave it empty. */
  website: string;
}

export type SubmitOutcome =
  | { kind: "success" }
  /** Field problems the server found (field -> fixed message from the contract). */
  | { kind: "invalid"; fields: Record<string, string> }
  | { kind: "rate_limited" }
  /** The server answered but couldn't save (or answered something unexpected): retry makes sense. */
  | { kind: "unavailable" }
  /** No answer at all (offline, timeout). */
  | { kind: "network" };

export const SUBMIT_TIMEOUT_MS = 10_000;

export function waitlistPayload(values: WaitlistFormValues) {
  return {
    email: values.email,
    source: WAITLIST_SOURCE,
    requestedMarketplaces: values.requestedMarketplaces,
    requestedMarketplaceOther: values.requestedMarketplaceOther,
    consentVersion: WAITLIST_CONSENT_VERSION,
    website: values.website,
  };
}

export async function submitWaitlist(values: WaitlistFormValues, fetchImpl: typeof fetch = fetch, timeoutMs = SUBMIT_TIMEOUT_MS): Promise<SubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(waitlistPayload(values)),
      signal: controller.signal,
    });
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 202) return { kind: "success" };
  if (response.status === 429) return { kind: "rate_limited" };
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { fields?: { field: string; message: string }[] } | null;
    const fields = Object.fromEntries((body?.fields ?? []).map((f) => [f.field, f.message]));
    return { kind: "invalid", fields };
  }
  return { kind: "unavailable" };
}

/** What the form says for each failure. No input is ever repeated back. */
export const FAILURE_MESSAGES: Record<Exclude<SubmitOutcome["kind"], "success">, string> = {
  invalid: "Please check the form and try again.",
  rate_limited: "Too many attempts from here. Please wait a few minutes, then try again.",
  unavailable: "We couldn't save your sign-up just now. Nothing went wrong on your side - please try again.",
  network: "We couldn't reach Rein Drop. Check your connection and try again.",
};
