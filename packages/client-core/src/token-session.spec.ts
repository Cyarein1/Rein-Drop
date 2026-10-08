import { describe, expect, it } from 'vitest';
import { nextTokenSession, REFRESH_MARGIN_MS, tokenSessionState } from './token-session.js';

const NOW = 1_800_000_000_000;
const WEEK = 7 * 86_400_000;

describe('token sessions', () => {
  it('starts a session with an absolute end, and refreshes never extend it', () => {
    const first = nextTokenSession(null, { accessToken: 'a1', expiresInSeconds: 3600 }, NOW, WEEK);
    expect(first).toEqual({ accessToken: 'a1', accessTokenExpiresAt: NOW + 3_600_000, createdAt: NOW, expiresAt: NOW + WEEK });
    const later = NOW + 3_500_000;
    expect(nextTokenSession(first, { accessToken: 'a2', expiresInSeconds: 4500 }, later, WEEK)).toEqual({
      accessToken: 'a2',
      accessTokenExpiresAt: later + 4_500_000,
      createdAt: NOW,
      expiresAt: NOW + WEEK,
    });
    expect(nextTokenSession(null, { accessToken: 'a', expiresInSeconds: null }, NOW, WEEK).accessTokenExpiresAt).toBe(NOW + 3_600_000);
  });

  it('is valid, due for refresh shortly before the token expires, and expired at the absolute end', () => {
    const s = nextTokenSession(null, { accessToken: 'a', expiresInSeconds: 3600 }, NOW, WEEK);
    expect(tokenSessionState(s, NOW)).toBe('valid');
    expect(tokenSessionState(s, s.accessTokenExpiresAt - REFRESH_MARGIN_MS)).toBe('refresh');
    expect(tokenSessionState(s, s.accessTokenExpiresAt + 1)).toBe('refresh');
    expect(tokenSessionState(s, s.expiresAt)).toBe('expired');
    expect(tokenSessionState(null, NOW)).toBe('expired');
  });
});
