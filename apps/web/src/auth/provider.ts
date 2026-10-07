import "server-only";
import { AUTH_PROVIDER_IDS, type AuthProviderId } from "@rein-drop/api-client";
import { createDevWebAuthProvider } from "./dev-provider";
import type { WebAuthProvider } from "./types";

export type AuthSetup =
  | { ok: true; provider: WebAuthProvider }
  | { ok: false; reason: string };

let cached: AuthSetup | undefined;

/**
 * Chooses the web auth provider from AUTH_PROVIDER (server-only env).
 * Development default: "dev". Production: must be set, and "dev" is refused - no
 * managed provider exists yet, so production has no way to sign in by design.
 * TODO(auth): add the managed provider as a new case once it is chosen.
 */
export function getAuthSetup(): AuthSetup {
  cached ??= resolve();
  return cached;
}

function resolve(): AuthSetup {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = process.env.AUTH_PROVIDER?.trim() || (isProduction ? undefined : "dev");

  if (!raw) {
    return { ok: false, reason: "No auth provider is configured for this production build (AUTH_PROVIDER is not set)." };
  }
  if (!(AUTH_PROVIDER_IDS as readonly string[]).includes(raw)) {
    return { ok: false, reason: `Unknown AUTH_PROVIDER "${raw}".` };
  }
  const id = raw as AuthProviderId;
  if (id === "dev" && isProduction) {
    return {
      ok: false,
      reason: 'AUTH_PROVIDER "dev" is development-only and is disabled in production builds.',
    };
  }

  switch (id) {
    case "dev":
      return { ok: true, provider: createDevWebAuthProvider(apiBaseUrl()) };
  }
}

/** Local API by default outside production, so no .env file is needed for development. */
export function apiBaseUrl(): string {
  const configured = process.env.API_BASE_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : "http://localhost:4000";
}
