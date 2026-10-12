import { z } from 'zod';

/**
 * Early-access waitlist (Landing 18-19): the shared rules behind the WaitlistSignup table and the
 * one public write, `POST /waitlist` (API) behind the web's `POST /api/waitlist`. There is
 * deliberately NO endpoint that lists, counts or looks up sign-ups.
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

/**
 * Marketplaces a visitor can request: the landing gallery's "On our radar" list (coming soon +
 * exploring), plus "other". The web app checks its gallery matches this list (marketing spec).
 */
export const WAITLIST_REQUESTABLE_MARKETPLACES = [
  'offerup', 'craigslist', 'mercari', 'poshmark',
  'depop', 'stockx', 'goat', 'grailed', 'reverb', 'swappa', 'etsy', 'whatnot', 'vinted', 'amazon', 'walmart',
] as const;
export const WAITLIST_MARKETPLACE_CHOICES = [...WAITLIST_REQUESTABLE_MARKETPLACES, 'other'] as const;

/**
 * Field messages never repeat what was sent (no email in an error, a log or a screenshot of one).
 */
export const WAITLIST_MESSAGES = {
  email: 'Enter a valid email address',
  source: 'Unknown sign-up source',
  marketplaces: 'Unknown or repeated marketplace',
  other: 'Name the other marketplace only when "other" is picked (60 characters max)',
  consent: 'Consent version is missing or not a date',
} as const;

export const joinWaitlistRequestSchema = z
  .object({
    /** Normalized here, so the API and the database only ever see the stored form. */
    email: z
      .string({ error: WAITLIST_MESSAGES.email })
      .max(WAITLIST_EMAIL_MAX + 64, { error: WAITLIST_MESSAGES.email })
      .transform((value, ctx) => {
        const email = normalizeWaitlistEmail(value);
        if (!email) {
          ctx.addIssue({ code: 'custom', message: WAITLIST_MESSAGES.email });
          return z.NEVER;
        }
        return email;
      }),
    source: z.enum(WAITLIST_SOURCES, { error: WAITLIST_MESSAGES.source }),
    requestedMarketplaces: z
      .array(z.enum(WAITLIST_MARKETPLACE_CHOICES, { error: WAITLIST_MESSAGES.marketplaces }), { error: WAITLIST_MESSAGES.marketplaces })
      .max(WAITLIST_MARKETPLACE_CHOICES.length, { error: WAITLIST_MESSAGES.marketplaces })
      .refine((list) => new Set(list).size === list.length, { error: WAITLIST_MESSAGES.marketplaces })
      .default([]),
    requestedMarketplaceOther: z
      .string({ error: WAITLIST_MESSAGES.other })
      .trim()
      .max(WAITLIST_OTHER_MARKETPLACE_MAX, { error: WAITLIST_MESSAGES.other })
      .transform((v) => (v === '' ? null : v))
      .nullish()
      .transform((v) => v ?? null),
    consentVersion: z.string({ error: WAITLIST_MESSAGES.consent }).regex(WAITLIST_CONSENT_VERSION_PATTERN, { error: WAITLIST_MESSAGES.consent }),
  })
  .refine((b) => b.requestedMarketplaceOther === null || b.requestedMarketplaces.includes('other'), {
    path: ['requestedMarketplaceOther'],
    error: WAITLIST_MESSAGES.other,
  });
export type JoinWaitlistRequestInput = z.input<typeof joinWaitlistRequestSchema>;
export type JoinWaitlistRequest = z.output<typeof joinWaitlistRequestSchema>;

/**
 * The same answer for a new address and one already on the list - the response must never reveal
 * whether an email signed up before.
 */
export const joinWaitlistResponseSchema = z.object({ status: z.literal('received') });
export type JoinWaitlistResponse = z.infer<typeof joinWaitlistResponseSchema>;
