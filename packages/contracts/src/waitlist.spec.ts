import { describe, expect, it } from 'vitest';
import {
  joinWaitlistRequestSchema,
  normalizeWaitlistEmail,
  WAITLIST_CONSENT_VERSION_PATTERN,
  WAITLIST_EMAIL_MAX,
  WAITLIST_MESSAGES,
  WAITLIST_SOURCES,
} from './index.js';

const valid = { email: ' Sam@Example.com ', source: 'landing_waitlist_form', consentVersion: '2026-10-12' };

describe('join waitlist request', () => {
  it('normalizes the email and fills defaults', () => {
    expect(joinWaitlistRequestSchema.parse(valid)).toEqual({
      email: 'sam@example.com',
      source: 'landing_waitlist_form',
      requestedMarketplaces: [],
      requestedMarketplaceOther: null,
      consentVersion: '2026-10-12',
    });
  });

  it('accepts requested marketplaces and a trimmed "other" name', () => {
    const r = joinWaitlistRequestSchema.parse({ ...valid, requestedMarketplaces: ['offerup', 'other'], requestedMarketplaceOther: '  Kijiji ' });
    expect(r).toMatchObject({ requestedMarketplaces: ['offerup', 'other'], requestedMarketplaceOther: 'Kijiji' });
    // Blank "other" name = none.
    expect(joinWaitlistRequestSchema.parse({ ...valid, requestedMarketplaces: ['other'], requestedMarketplaceOther: '  ' }).requestedMarketplaceOther).toBeNull();
  });

  it.each([
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['missing email', { email: undefined }, 'email'],
    ['unknown source', { source: 'somewhere' }, 'source'],
    ['launch target is not requestable', { requestedMarketplaces: ['ebay'] }, 'requestedMarketplaces'],
    ['repeated marketplace', { requestedMarketplaces: ['etsy', 'etsy'] }, 'requestedMarketplaces'],
    ['other name without "other"', { requestedMarketplaceOther: 'Kijiji' }, 'requestedMarketplaceOther'],
    ['other name too long', { requestedMarketplaces: ['other'], requestedMarketplaceOther: 'x'.repeat(61) }, 'requestedMarketplaceOther'],
    ['undated consent', { consentVersion: 'v1' }, 'consentVersion'],
  ])('rejects %s', (_name, patch, path) => {
    const r = joinWaitlistRequestSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    // The field, or one of its items (e.g. requestedMarketplaces.0).
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === path || i.path.join('.').startsWith(`${path}.`))).toBe(true);
  });

  it('error messages never repeat the email that was sent', () => {
    const email = 'private.person@nowhere';
    const r = joinWaitlistRequestSchema.safeParse({ ...valid, email });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).not.toContain('private.person');
      expect(r.error.issues[0]!.message).toBe(WAITLIST_MESSAGES.email);
    }
  });
});

describe('waitlist', () => {
  it('normalizes emails to one stored form (trimmed, lower-cased)', () => {
    expect(normalizeWaitlistEmail('  Sam.Reseller+Flips@Example.COM ')).toBe('sam.reseller+flips@example.com');
    expect(normalizeWaitlistEmail('SAM@EXAMPLE.COM')).toBe(normalizeWaitlistEmail('sam@example.com'));
  });

  it('rejects anything that is not a plausible address', () => {
    for (const bad of ['', '   ', 'sam', 'sam@', '@example.com', 'sam@example', 'sam @example.com', 'sam@@example.com', 'a@b.c d']) {
      expect(normalizeWaitlistEmail(bad), bad).toBeNull();
    }
    const long = `${'a'.repeat(WAITLIST_EMAIL_MAX)}@example.com`;
    expect(normalizeWaitlistEmail(long)).toBeNull();
  });

  it('has a known source list and a dated consent version format', () => {
    expect(WAITLIST_SOURCES).toEqual(['landing_waitlist_form']);
    expect(WAITLIST_CONSENT_VERSION_PATTERN.test('2026-10-12')).toBe(true);
    expect(WAITLIST_CONSENT_VERSION_PATTERN.test('v1')).toBe(false);
  });
});
