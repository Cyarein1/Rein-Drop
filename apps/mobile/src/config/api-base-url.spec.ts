import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './api-base-url';

describe('resolveApiBaseUrl', () => {
  it('uses EXPO_PUBLIC_API_BASE_URL when set (trailing slash removed)', () => {
    expect(
      resolveApiBaseUrl({ envUrl: ' https://api.example.com/ ', hostUri: '192.168.1.50:8081', isDev: true }),
    ).toMatchObject({ url: 'https://api.example.com', source: 'env' });
    expect(resolveApiBaseUrl({ envUrl: 'https://api.example.com', isDev: false })).toMatchObject({
      url: 'https://api.example.com',
    });
  });

  it('derives the dev machine LAN address from the Metro host in development', () => {
    expect(resolveApiBaseUrl({ hostUri: '192.168.1.50:8081', isDev: true })).toMatchObject({
      url: 'http://192.168.1.50:4000',
      source: 'dev-server-host',
    });
  });

  it('honours EXPO_PUBLIC_API_PORT and rejects invalid ports', () => {
    expect(resolveApiBaseUrl({ hostUri: '10.0.0.7:8081', envPort: '4100', isDev: true }).url).toBe(
      'http://10.0.0.7:4100',
    );
    expect(resolveApiBaseUrl({ hostUri: '10.0.0.7:8081', envPort: 'abc', isDev: true })).toMatchObject({
      url: null,
      source: 'none',
    });
  });

  it('handles hosts without a port and IPv6 hosts', () => {
    expect(resolveApiBaseUrl({ hostUri: 'localhost', isDev: true }).url).toBe('http://localhost:4000');
    expect(resolveApiBaseUrl({ hostUri: '[fe80::1]:8081', isDev: true }).url).toBe('http://[fe80::1]:4000');
  });

  it('refuses tunnel hosts, which cannot reach the API port', () => {
    const result = resolveApiBaseUrl({ hostUri: 'abc-anonymous-8081.exp.direct', isDev: true });
    expect(result).toMatchObject({ url: null, source: 'none' });
    expect(result.detail).toMatch(/Tunnel/);
  });

  it('never guesses outside development', () => {
    expect(resolveApiBaseUrl({ hostUri: '192.168.1.50:8081', isDev: false })).toMatchObject({
      url: null,
      source: 'none',
    });
  });

  it('explains when nothing is available', () => {
    expect(resolveApiBaseUrl({ hostUri: null, isDev: true }).detail).toMatch(/EXPO_PUBLIC_API_BASE_URL/);
  });
});
