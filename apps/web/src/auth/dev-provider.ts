import "server-only";
import { ApiError, createApiClient, DEV_AUTH_HEADER, DEV_AUTH_SUBJECT } from "@rein-drop/api-client";
import type { SessionResult, WebAuthProvider } from "./types";

/**
 * DEVELOPMENT-ONLY web auth. No sign-in form, no passwords, no cookies: every
 * request acts as the seeded local user by sending the dev subject header to the
 * API, which verifies it with its own DevAuthProvider (and only accepts it from
 * this machine / the local network).
 *
 * Refuses to be created in production builds.
 */
export function createDevWebAuthProvider(apiBaseUrl: string): WebAuthProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development auth provider must never run in a production build");
  }

  const headers = { [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT };
  const api = createApiClient({ baseUrl: apiBaseUrl, timeoutMs: 5000, getHeaders: () => headers });

  return {
    id: "dev",
    // Development sessions need no cookie; the API makes the real decision.
    mightBeAuthenticated: () => true,
    async getSession(): Promise<SessionResult> {
      try {
        const user = await api.getMe();
        return { status: "authenticated", session: { user, provider: "dev", isDevelopment: true } };
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          return { status: "unauthenticated", reason: err.message };
        }
        throw err;
      }
    },
    getApiHeaders: async () => headers,
  };
}
