import "server-only";
import { cookies } from "next/headers";
import { ApiError, createApiClient } from "@rein-drop/api-client";
import type { EntraWebConfig } from "./entra/config";
import { SESSION_COOKIE, sessionState, unseal, type WebSession } from "./entra/session";
import type { SessionResult, WebAuthProvider } from "./types";

/**
 * Microsoft Entra External ID web auth (decision 0013). The session lives in encrypted httpOnly
 * cookies set by /auth/callback and kept fresh by the Proxy; this reads it and lets the API decide
 * (the API verifies the access token on every request).
 */
export function createEntraWebAuthProvider(config: EntraWebConfig, apiBaseUrl: string): WebAuthProvider {
  async function currentSession(): Promise<WebSession | null> {
    const session = await unseal<WebSession>("session", (await cookies()).get(SESSION_COOKIE)?.value, config.sessionSecret);
    // An access token past its expiry is useless here (only the Proxy can refresh it).
    return session && sessionState(session, Date.now()) !== "expired" && session.accessTokenExpiresAt > Date.now() ? session : null;
  }

  const headersFor = (session: WebSession) => ({ authorization: `Bearer ${session.accessToken}` });

  return {
    id: "entra",
    mightBeAuthenticated: (request) => request.cookies.has(SESSION_COOKIE),
    async getSession(): Promise<SessionResult> {
      const session = await currentSession();
      if (!session) return { status: "unauthenticated", reason: "Sign in to continue" };
      const api = createApiClient({ baseUrl: apiBaseUrl, platform: "web", timeoutMs: 5000, getHeaders: () => headersFor(session) });
      try {
        const user = await api.getMe();
        return { status: "authenticated", session: { user, provider: "entra", isDevelopment: false } };
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return { status: "unauthenticated", reason: err.message };
        throw err;
      }
    },
    async getApiHeaders(): Promise<Record<string, string>> {
      const session = await currentSession();
      return session ? headersFor(session) : {};
    },
  };
}
