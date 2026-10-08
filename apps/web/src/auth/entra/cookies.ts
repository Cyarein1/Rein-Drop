import type { EntraWebConfig } from "./config";
import type { Tokens } from "./oidc";
import { cookieOptions, REFRESH_COOKIE, seal, SESSION_COOKIE } from "./session";

/** The cookie surface of NextResponse / cookies() (set with options + delete). */
interface ResponseCookies {
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

export interface SealedSession {
  session: string;
  refresh: string | null;
  /** Seconds until the session's absolute expiry (the cookies' max-age). */
  ttl: number;
}

export async function sealTokens(config: EntraWebConfig, tokens: Tokens, now: number): Promise<SealedSession> {
  const ttl = Math.floor((tokens.session.expiresAt - now) / 1000);
  return {
    session: await seal("session", tokens.session, config.sessionSecret, ttl),
    refresh: tokens.refreshToken ? await seal("refresh", { refreshToken: tokens.refreshToken }, config.sessionSecret, ttl) : null,
    ttl,
  };
}

/** Both session cookies live exactly until the session's absolute expiry. */
export function setSessionCookies(jar: ResponseCookies, config: EntraWebConfig, sealed: SealedSession): void {
  jar.set(SESSION_COOKIE, sealed.session, cookieOptions(config.appBaseUrl, sealed.ttl));
  if (sealed.refresh) jar.set(REFRESH_COOKIE, sealed.refresh, cookieOptions(config.appBaseUrl, sealed.ttl));
  else jar.delete(REFRESH_COOKIE);
}

export function clearSessionCookies(jar: ResponseCookies): void {
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
