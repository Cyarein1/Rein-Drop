import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@rein-drop/contracts';
import type { NextFunction, Request, Response } from 'express';
import { resolveRequestId, setRequestId } from './request-id.js';

/**
 * Assigns a request id (reusing a valid incoming `x-request-id`), echoes it in
 * the response header, and logs one line per request when the response finishes.
 * Logs the path only - query strings may contain user data.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    setRequestId(req, requestId);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const start = process.hrtime.bigint();
    const path = req.originalUrl.split('?')[0];

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms [${requestId}]`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
