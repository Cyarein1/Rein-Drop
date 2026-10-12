/**
 * Early-access waitlist (Landing 18): the shared rules behind the WaitlistSignup table. The
 * sign-up endpoint and its request schema come with the waitlist API (Landing 19-20). There is
 * deliberately NO public endpoint that lists sign-ups.
 */

/** Where a sign-up came from. Stored as text; add a value here before using it anywhere. */
export const WAITLIST_SOURCES = ['landing_waitlist_form'] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

/** RFC 5321 path limit - longer can't be a deliverable address. */
export const WAITLIST_EMAIL_MAX = 254;

/** Free-text name for a requested "Other" marketplace (matches the landing form's limit). */
export const WAITLIST_OTHER_MARKETPLACE_MAX = 60;

/** Consent version format, e.g. "2026-10-12" - the date of the privacy / consent text agreed to. */
export const WAITLIST_CONSENT_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one stored form of an email, so the unique index catches repeats: trimmed and lower-cased
 * as a whole. Lower-casing the local part is a deliberate simplification - real providers treat
 * it case-insensitively, and a waitlist must not hold the same person twice. Dots and "+tags"
 * are kept (they can be genuinely different inboxes). Returns null for anything that isn't a
 * plausible address; full validation happens at the API boundary.
 */
export function normalizeWaitlistEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > WAITLIST_EMAIL_MAX) return null;
  // One "@", something before it, a dotted domain after it, no whitespace.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
