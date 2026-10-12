import { ApiError, createApiClient } from "@rein-drop/api-client";
import { apiBaseUrl } from "@/auth/provider";
import { createWaitlistHandler, RateLimiter } from "@/marketing/waitlist/waitlist-route";

/**
 * POST /api/waitlist - early-access sign-up from the landing page. All checks live in
 * waitlist-route.ts; this file wires them to the API client (server-to-server, no auth: the API
 * route is public) and to the server log. GET and the other methods answer 405 (Next.js default).
 */
const limiter = new RateLimiter();

export const POST = createWaitlistHandler({
  limiter,
  forward: async (signup) => {
    try {
      await createApiClient({ baseUrl: apiBaseUrl(), timeoutMs: 5000 }).joinWaitlist(signup);
      return { ok: true };
    } catch (err) {
      return { ok: false, status: err instanceof ApiError ? err.status : undefined };
    }
  },
  // Structured, email-free (see WaitlistLogEntry).
  log: (entry) => (entry.status >= 500 ? console.error : console.info)(JSON.stringify(entry)),
});
