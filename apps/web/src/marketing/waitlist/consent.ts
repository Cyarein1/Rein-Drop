/**
 * The early-access consent (Landing 20) - ONE place for the words the visitor agrees to and the
 * version stored with each sign-up (WaitlistSignup.consentVersion). Change the words => change the
 * version (the date of the change), so every stored sign-up says which text it agreed to. The
 * privacy draft carries the same date.
 */
export const WAITLIST_CONSENT_VERSION = "2026-10-12";

/**
 * The checkbox label, in parts so the privacy notice can be a link. No promises about frequency,
 * unsubscribe mechanics or data handling.
 */
export const WAITLIST_CONSENT = { lead: "Email me about Rein Drop early access. I've read the ", link: "privacy notice", tail: "." } as const;
export const WAITLIST_CONSENT_LABEL = `${WAITLIST_CONSENT.lead}${WAITLIST_CONSENT.link}${WAITLIST_CONSENT.tail}`;

/** Small print under the form. Plain facts about what happens; nothing is guaranteed. */
export const WAITLIST_FINE_PRINT =
  "We use your email only to contact you about Rein Drop early access, and your marketplace picks to decide what to look at next. You can ask us to remove your sign-up at any time.";

/** Where the sign-up came from (contract WAITLIST_SOURCES). */
export const WAITLIST_SOURCE = "landing_waitlist_form" as const;

/**
 * Client-side email check before sending (the server's zod schema decides). Same rule as the
 * contract's normalizeWaitlistEmail - a spec keeps them in agreement - without shipping zod and
 * the whole contracts package to the browser.
 */
export function emailProblem(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return "Enter your email address";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address, like name@example.com";
  return null;
}
