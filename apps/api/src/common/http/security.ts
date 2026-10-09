import { Injectable, type INestApplication, type NestMiddleware } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Largest JSON body the API accepts (every request contract is far smaller). */
export const JSON_BODY_LIMIT = '100kb';

/**
 * HTTP-level settings for the API process (docs/security/hardening-2026-10.md).
 *
 * CORS is deliberately NOT enabled: no browser calls the API directly - the web app calls it from
 * its server, and the mobile app is not a browser. Without CORS headers, browsers refuse
 * cross-origin reads, which is what we want. Enable it only for a concrete browser client.
 */
export function configureHttp(app: INestApplication, options: { trustProxyHops: number }): void {
  const express = app as NestExpressApplication;
  // Don't advertise the framework.
  express.disable('x-powered-by');
  // Client IPs (anonymous rate limiting, logs) come from X-Forwarded-For only through known proxies.
  express.set('trust proxy', options.trustProxyHops);
  // Explicit limits, so a future default change can't silently raise them (raw bodies stay
  // available for webhook signatures - the app is created with rawBody: true).
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  express.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });
}

/**
 * Response headers for a JSON API: never sniffed, framed, cached or shown with a referrer.
 * HSTS is set in production (TLS is terminated in front of the API there).
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // Responses carry personal data: never store them in shared or browser caches.
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  }
}
