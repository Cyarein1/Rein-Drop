import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createApiClient, type ApiClient } from "@rein-drop/api-client";
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
  return result.session;
});

/** API client acting as the current user. Verifies the session first. */
export const getServerApiClient = cache(async (): Promise<ApiClient> => {
  await verifySession();
  const setup = getAuthSetup();
  if (!setup.ok) redirect("/sign-in");
  const provider = setup.provider;
  return createApiClient({ baseUrl: apiBaseUrl(), getHeaders: () => provider.getApiHeaders() });
});
