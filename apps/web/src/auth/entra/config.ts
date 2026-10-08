import { ENTRA_DEFAULT_SCOPE_NAME, entraApiScope } from "@rein-drop/api-client";

/**
 * Web settings for Microsoft Entra External ID (decision 0013). Server-only environment variables:
 * the client secret and session secret are SECRETS - untracked .env / secret store only.
 */
export interface EntraWebConfig {
  /** https://<tenant-subdomain>.ciamlogin.com */
  authority: string;
  tenantId: string;
  /** Application (client) ID of the web app registration. */
  clientId: string;
  clientSecret: string;
  /** Full scope of the Rein Drop API, e.g. api://<api-client-id>/access_as_user. */
  apiScope: string;
  /** Public origin of this web app (redirect URIs are built from it), e.g. http://localhost:3000. */
  appBaseUrl: string;
  /** Encrypts the session cookies (32+ characters). */
  sessionSecret: string;
  /** Absolute session lifetime: after it the user signs in again, whatever the token refreshes. */
  sessionMaxAgeSeconds: number;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_SESSION_HOURS = 168;

export type EntraWebConfigResult = { ok: true; config: EntraWebConfig } | { ok: false; reason: string };

export function readEntraWebConfig(env: Record<string, string | undefined> = process.env): EntraWebConfigResult {
  const v = (key: string) => env[key]?.trim() || undefined;
  const problems: string[] = [];
  const authority = v("ENTRA_AUTHORITY");
  const tenantId = v("ENTRA_TENANT_ID");
  const clientId = v("ENTRA_WEB_CLIENT_ID");
  const clientSecret = v("ENTRA_WEB_CLIENT_SECRET");
  const apiClientId = v("ENTRA_API_CLIENT_ID");
  const appBaseUrl = v("APP_BASE_URL");
  const sessionSecret = v("AUTH_SESSION_SECRET");
  const hours = Number(v("AUTH_SESSION_MAX_AGE_HOURS") ?? DEFAULT_SESSION_HOURS);

  if (!authority || !/^https:\/\/[^/]+/.test(authority)) problems.push("ENTRA_AUTHORITY (https URL)");
  if (!tenantId || !GUID.test(tenantId)) problems.push("ENTRA_TENANT_ID (GUID)");
  if (!clientId || !GUID.test(clientId)) problems.push("ENTRA_WEB_CLIENT_ID (GUID)");
  if (!clientSecret) problems.push("ENTRA_WEB_CLIENT_SECRET");
  if (!apiClientId || !GUID.test(apiClientId)) problems.push("ENTRA_API_CLIENT_ID (GUID)");
  if (!appBaseUrl || !/^https?:\/\/[^/]+$/.test(appBaseUrl.replace(/\/+$/, ""))) problems.push("APP_BASE_URL (origin, e.g. https://app.example.com)");
  if (!sessionSecret || sessionSecret.length < 32) problems.push("AUTH_SESSION_SECRET (32+ characters)");
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) problems.push("AUTH_SESSION_MAX_AGE_HOURS (1-720)");
  if (problems.length > 0) return { ok: false, reason: `Sign-in is not configured: set ${problems.join(", ")}.` };

  return {
    ok: true,
    config: {
      authority: authority!,
      tenantId: tenantId!.toLowerCase(),
      clientId: clientId!,
      clientSecret: clientSecret!,
      apiScope: entraApiScope(apiClientId!.toLowerCase(), v("ENTRA_API_SCOPE_NAME") ?? ENTRA_DEFAULT_SCOPE_NAME),
      appBaseUrl: appBaseUrl!.replace(/\/+$/, ""),
      sessionSecret: sessionSecret!,
      sessionMaxAgeSeconds: hours * 3600,
    },
  };
}
