import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createApiClient, detectedLocaleRequest, type ApiClient } from "@rein-drop/api-client";
import { apiBaseUrl, getAuthSetup } from "./provider";
import type { Session } from "./types";

export type { Session } from "./types";

/**
 * Data Access Layer entry point (Next.js auth guide): verifies the session at
 * request time, memoized per render. Redirects to /sign-in when there is no
 * session; throws (-> error boundary) when the session cannot be checked.
 *
 * Call it in every protected page / data access - not only in layouts, which do
 * not re-render on client navigation.
 */
export const verifySession = cache(async (): Promise<Session> => {
  await connection();
  const setup = getAuthSetup();
  if (!setup.ok) redirect("/sign-in");

  const result = await setup.provider.getSession();
  if (result.status === "unauthenticated") redirect("/sign-in");

  const session = result.session;
  if (!session.user.locale) {
    const locale = await reportDetectedLocale(setup.provider.getApiHeaders());
    if (locale) return { ...session, user: { ...session.user, locale } };
  }
  return session;
});

/**
 * First sign-in: report the browser locale (Accept-Language, e.g. "en-ZA,en;q=0.9") so
 * currency, distance unit and language default to where the user is. Only runs while the
 * stored locale is empty; the API never lets detection overwrite an existing locale.
 * Best effort - a failure must never break the page.
 */
async function reportDetectedLocale(headersPromise: Promise<Record<string, string>>) {
  const firstTag = (await headers()).get("accept-language")?.split(",")[0]?.split(";")[0]?.trim();
  const request = detectedLocaleRequest(firstTag);
  if (!request) return null;
  try {
    const authHeaders = await headersPromise;
    const api = createApiClient({ baseUrl: apiBaseUrl(), platform: "web", getHeaders: () => authHeaders });
    return await api.updateLocale(request);
  } catch {
    return null;
  }
}

/**
 * Base URL + auth headers acting as the current user, for the rare raw call the typed client
 * can't make (binary map tiles). Verifies the session first.
 */
export async function getServerApiRequest(): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  await verifySession();
  const setup = getAuthSetup();
  if (!setup.ok) redirect("/sign-in");
  return { baseUrl: apiBaseUrl(), headers: await setup.provider.getApiHeaders() };
}

/**
 * API client acting as the current user. Verifies the session first. Sends `platform: "web"`
 * (x-client-platform) so item history records changes as made in a browser.
 */
export const getServerApiClient = cache(async (): Promise<ApiClient> => {
  await verifySession();
  const setup = getAuthSetup();
  if (!setup.ok) redirect("/sign-in");
  const provider = setup.provider;
  return createApiClient({ baseUrl: apiBaseUrl(), platform: "web", getHeaders: () => provider.getApiHeaders() });
});
