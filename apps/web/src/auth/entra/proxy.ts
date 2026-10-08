import { NextResponse, type NextRequest } from "next/server";
import type { EntraWebConfig } from "./config";
import { clearSessionCookies, sealTokens, setSessionCookies } from "./cookies";
import { entraConfiguration, refreshSession } from "./oidc";
import { REFRESH_COOKIE, SESSION_COOKIE, sessionState, unseal, type WebSession } from "./session";

/**
 * Session upkeep for protected routes (Next.js Proxy - the one place that can rewrite cookies
 * before a page renders). No session or an ended session -> sign-in. An access token close to
 * expiry is refreshed with the refresh token; the new cookies go to the browser AND to this
 * request, so the page renders with the fresh token. A failed refresh ends the session.
 */
export async function entraProxy(request: NextRequest, config: EntraWebConfig, now = Date.now()): Promise<NextResponse> {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await unseal<WebSession>("session", raw, config.sessionSecret);
  const state = sessionState(session, now);
  if (state === "valid") return NextResponse.next();
  if (state === "expired") return toSignIn(request, raw ? "expired" : null);

  const stored = await unseal<{ refreshToken: string }>("refresh", request.cookies.get(REFRESH_COOKIE)?.value, config.sessionSecret);
  if (!stored) return toSignIn(request, "expired");
  try {
    const tokens = await refreshSession(await entraConfiguration(config), config, session!, stored.refreshToken, now);
    const sealed = await sealTokens(config, tokens, now);
    // This request renders with the new token...
    request.cookies.set(SESSION_COOKIE, sealed.session);
    if (sealed.refresh) request.cookies.set(REFRESH_COOKIE, sealed.refresh);
    const response = NextResponse.next({ request: { headers: request.headers } });
    // ...and the browser keeps it.
    setSessionCookies(response.cookies, config, sealed);
    return response;
  } catch {
    // Revoked / expired refresh token, or Entra unreachable: sign in again rather than fail later.
    return toSignIn(request, "expired");
  }
}

function toSignIn(request: NextRequest, reason: "expired" | null): NextResponse {
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (reason) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  clearSessionCookies(response.cookies);
  return response;
}
