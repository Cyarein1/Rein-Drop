import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@rein-drop/contracts';
import type { NextFunction, Request, Response } from 'express';
import { getPrincipal } from '../../auth/decorators.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { resolveRequestId, setRequestId } from './request-id.js';

/**
 * Assigns a request id (reusing a valid incoming `x-request-id`), echoes it in
 * the response header, and logs one line per request when the response finishes.
 * Logs the path only - query strings may contain user data - and never bodies or headers
 * (authorization, cookies, signatures). With LOG_FORMAT=json the line is a structured object:
 * method, path, status, durationMs, requestId and the internal user id when signed in.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    setRequestId(req, requestId);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const start = process.hrtime.bigint();
    const path = req.originalUrl.split('?')[0];

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const entry =
        this.config.logFormat === 'json'
          ? { event: 'http_request', method: req.method, path, status: res.statusCode, durationMs: Math.round(ms * 10) / 10, requestId, userId: getPrincipal(req)?.userId ?? null }
          : `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms [${requestId}]`;
      if (res.statusCode >= 500) this.logger.error(entry);
      else if (res.statusCode >= 400) this.logger.warn(entry);
      else this.logger.log(entry);
    });

    next();
  }
}
