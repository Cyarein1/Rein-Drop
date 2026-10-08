import { EncryptJWT, jwtDecrypt } from "jose";
import { tokenSessionState, type TokenSession, type TokenSessionState } from "@rein-drop/client-core";

/**
 * Encrypted, httpOnly cookie sessions (no server-side session store: the web app has no database).
 * Each cookie is a JWE (dir + A256GCM) under a key derived from AUTH_SESSION_SECRET, tagged with a
 * purpose so one cookie can't be replayed as another. Tokens never reach browser JavaScript.
 *
 * - rd_session: the API access token, its expiry and the absolute session expiry.
 * - rd_refresh: the refresh token (separate cookie: two tokens don't fit one 4 KB cookie).
 * - rd_auth_flow: PKCE verifier, state, nonce and return path during sign-in (10 minutes).
 */
export const SESSION_COOKIE = "rd_session";
export const REFRESH_COOKIE = "rd_refresh";
export const FLOW_COOKIE = "rd_auth_flow";
export const FLOW_TTL_SECONDS = 600;

/** The API access token and the session's absolute end (shared rules: @rein-drop/client-core). */
export type WebSession = TokenSession;

export interface AuthFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Where to go after sign-in (a safe same-origin path). */
  next: string;
}

type Purpose = "session" | "refresh" | "flow";

async function keyFor(secret: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rein-drop-web-session:${secret}`)));
}

export async function seal(purpose: Purpose, data: object, secret: string, ttlSeconds: number): Promise<string> {
  return new EncryptJWT({ purpose, data: data as Record<string, unknown> })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.floor(ttlSeconds))}s`)
    .encrypt(await keyFor(secret));
}

/** The sealed data, or null when missing, tampered, expired, sealed with another secret or for another purpose. */
export async function unseal<T>(purpose: Purpose, value: string | undefined, secret: string): Promise<T | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, await keyFor(secret));
    return payload.purpose === purpose ? (payload.data as T) : null;
  } catch {
    return null;
  }
}

export function cookieOptions(appBaseUrl: string, maxAgeSeconds: number) {
  return { httpOnly: true, secure: appBaseUrl.startsWith("https://"), sameSite: "lax" as const, path: "/", maxAge: Math.max(0, Math.floor(maxAgeSeconds)) };
}

/** Only same-origin paths: blocks open redirects such as //evil.example or /\evil.example. */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}

/** valid = use it; refresh = access token (nearly) expired; expired = the session itself is over. */
export const sessionState: (session: WebSession | null, now: number) => TokenSessionState = tokenSessionState;
