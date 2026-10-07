/**
 * Resolves which API base URL the app talks to. Pure (no React Native imports) so it can be
 * unit-tested; `src/config/api.ts` feeds it the real runtime values.
 *
 * Order:
 *  1. EXPO_PUBLIC_API_BASE_URL, when set - always wins (any environment).
 *  2. Development only: the host of the Metro dev server the app was loaded from
 *     (Expo's `hostUri`, e.g. "192.168.1.50:8081") with the API port. On a physical phone
 *     this is the developer machine's LAN address, so nothing needs to be hard-coded.
 *  3. Otherwise not configured - callers show a clear error instead of guessing.
 */

export const DEFAULT_API_PORT = 4000;

export type ApiBaseUrlSource = 'env' | 'dev-server-host' | 'none';

export interface ResolvedApiBaseUrl {
  url: string | null;
  source: ApiBaseUrlSource;
  /** Human-readable explanation, shown in Settings > Developer. */
  detail: string;
}

export interface ResolveApiBaseUrlInput {
  /** EXPO_PUBLIC_API_BASE_URL */
  envUrl?: string;
  /** EXPO_PUBLIC_API_PORT (development fallback only) */
  envPort?: string;
  /** Constants.expoConfig?.hostUri - "host:port" of the Metro server, when known. */
  hostUri?: string | null;
  /** __DEV__ */
  isDev: boolean;
}

/** Tunnel hosts (`expo start --tunnel`) proxy Metro only - the API port is not reachable through them. */
const TUNNEL_HOST = /(\.exp\.direct|\.ngrok\.io|\.ngrok-free\.app)$/i;

export function resolveApiBaseUrl(input: ResolveApiBaseUrlInput): ResolvedApiBaseUrl {
  const envUrl = input.envUrl?.trim();
  if (envUrl) {
    return { url: envUrl.replace(/\/+$/, ''), source: 'env', detail: 'Set by EXPO_PUBLIC_API_BASE_URL' };
  }

  if (!input.isDev) {
    return {
      url: null,
      source: 'none',
      detail: 'EXPO_PUBLIC_API_BASE_URL is required outside development',
    };
  }

  const port = parsePort(input.envPort);
  if (port === null) {
    return { url: null, source: 'none', detail: `EXPO_PUBLIC_API_PORT is not a valid port: "${input.envPort}"` };
  }

  const host = hostFromHostUri(input.hostUri);
  if (!host) {
    return {
      url: null,
      source: 'none',
      detail: 'Could not detect the dev machine address - set EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env',
    };
  }
  if (TUNNEL_HOST.test(host)) {
    return {
      url: null,
      source: 'none',
      detail: 'Tunnel mode cannot reach the API - set EXPO_PUBLIC_API_BASE_URL or use LAN mode',
    };
  }

  const urlHost = host.includes(':') ? `[${host}]` : host; // bare IPv6
  return {
    url: `http://${urlHost}:${port}`,
    source: 'dev-server-host',
    detail: `Detected from the Expo dev server (${host}), API port ${port}`,
  };
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return DEFAULT_API_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/** "192.168.1.50:8081" -> "192.168.1.50"; "[fe80::1]:8081" -> "fe80::1"; "host" -> "host". */
function hostFromHostUri(hostUri: string | null | undefined): string | null {
  const value = hostUri?.trim();
  if (!value) return null;
  const withoutPath = value.split('/')[0] ?? '';
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(withoutPath);
  if (bracketed) return bracketed[1] ?? null;
  const host = withoutPath.replace(/:\d+$/, '');
  return host || null;
}
