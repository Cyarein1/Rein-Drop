import { describe, expect, it } from 'vitest';
import { normalizeWaitlistEmail, WAITLIST_CONSENT_VERSION_PATTERN, WAITLIST_EMAIL_MAX, WAITLIST_SOURCES } from './index.js';

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
