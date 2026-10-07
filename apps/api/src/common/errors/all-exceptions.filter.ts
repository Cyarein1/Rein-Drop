import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ApiErrorCode, ApiErrorDetail } from '@rein-drop/contracts';
import { Prisma } from '@rein-drop/db';
import type { Request, Response } from 'express';
import { getRequestId } from '../logging/request-id.js';
import { AppException } from './app.exception.js';

interface NormalizedError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const INTERNAL_ERROR: NormalizedError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  message: 'Internal server error',
};

/** Converts every thrown error into the standard ApiErrorBody. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const error = normalize(exception);
    const requestId = getRequestId(req);
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;

    if (error.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${path} -> ${error.statusCode} [${requestId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(requestId ? { requestId } : {}),
      path,
      timestamp: new Date().toISOString(),
    };
    res.status(error.statusCode).json(body);
  }
}

export function normalize(exception: unknown): NormalizedError {
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    // Never expose messages of unexpected 5xx errors.
    if (statusCode >= 500 && !CODE_BY_STATUS[statusCode]) return INTERNAL_ERROR;
    return {
      statusCode,
      code: CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: httpExceptionMessage(exception),
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: 'A record with the same unique value already exists',
      };
    }
    if (exception.code === 'P2025') {
      return { statusCode: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Record not found' };
    }
    return INTERNAL_ERROR;
  }

  // Errors raised by Express body parsing (malformed JSON, body too large) before Nest handles the request.
  const bodyParser = bodyParserError(exception);
  if (bodyParser) return bodyParser;

  return INTERNAL_ERROR;
}

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return exception.message;
}

function bodyParserError(exception: unknown): NormalizedError | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || typeof status !== 'number') return undefined;
  if (type === 'entity.parse.failed') {
    return { statusCode: 400, code: 'BAD_REQUEST', message: 'Request body is not valid JSON' };
  }
  if (type === 'entity.too.large') {
    return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  }
  return undefined;
}
