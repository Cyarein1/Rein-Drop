import "server-only";
import { AUTH_PROVIDER_IDS, type AuthProviderId } from "@rein-drop/api-client";
import { createDevWebAuthProvider } from "./dev-provider";
import { readEntraWebConfig, type EntraWebConfig } from "./entra/config";
import { createEntraWebAuthProvider } from "./entra-provider";
import type { WebAuthProvider } from "./types";

export type AuthSetup =
  | { ok: true; provider: WebAuthProvider; entra: EntraWebConfig | null }
  | { ok: false; reason: string };

let cached: AuthSetup | undefined;

/**
 * Chooses the web auth provider from AUTH_PROVIDER (server-only env).
 * Development default: "dev". Production: "entra" (Microsoft Entra External ID, decision 0013);
 * "dev" cannot be enabled - its code is not even in production builds (see dev-provider.ts).
 */
export function getAuthSetup(): AuthSetup {
  cached ??= resolve();
  return cached;
}

function resolve(): AuthSetup {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = process.env.AUTH_PROVIDER?.trim() || (isProduction ? "entra" : "dev");

  if (!(AUTH_PROVIDER_IDS as readonly string[]).includes(raw)) {
    return { ok: false, reason: `Unknown AUTH_PROVIDER "${raw}".` };
  }
  const id = raw as AuthProviderId;

  switch (id) {
    case "dev": {
      if (isProduction || !createDevWebAuthProvider) {
        return { ok: false, reason: 'AUTH_PROVIDER "dev" is development-only and is not available in production builds.' };
      }
      return { ok: true, provider: createDevWebAuthProvider(apiBaseUrl()), entra: null };
    }
    case "entra": {
      const config = readEntraWebConfig();
      if (!config.ok) return { ok: false, reason: config.reason };
      return { ok: true, provider: createEntraWebAuthProvider(config.config, apiBaseUrl()), entra: config.config };
    }
  }
}

/** Local API by default outside production, so no .env file is needed for development. */
export function apiBaseUrl(): string {
  const configured = process.env.API_BASE_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : "http://localhost:4000";
}
