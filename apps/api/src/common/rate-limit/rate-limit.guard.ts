import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { getPrincipal } from '../../auth/decorators.js';

/** Stricter limit for routes that create provider sessions or change money state (per user per minute). */
export const STRICT_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/**
 * Global rate limit (docs/security/hardening-2026-10.md). Counts per signed-in USER, not per IP:
 * every web user reaches the API through the web server's address, so an IP limit would throttle
 * all of them together. Anonymous callers (public routes) are counted per client IP - set
 * TRUST_PROXY_HOPS when the API runs behind a proxy so that IP is the real one.
 *
 * Runs after the AuthGuard (registered after it), so the principal is known. In-memory counters:
 * fine for one API instance; several instances need a shared store (OUTSTANDING).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const principal = getPrincipal(req as unknown as Request);
    return principal ? `user:${principal.userId}` : `ip:${String((req as unknown as Request).ip ?? 'unknown')}`;
  }
}
