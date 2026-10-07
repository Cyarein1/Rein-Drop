import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Accept client-supplied ids only if they are short and log-safe. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const REQUEST_ID = Symbol('requestId');

type RequestWithId = Request & { [REQUEST_ID]?: string };

export function resolveRequestId(incoming: string | string[] | undefined): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && VALID_REQUEST_ID.test(value) ? value : randomUUID();
}

export function setRequestId(req: Request, id: string): void {
  (req as RequestWithId)[REQUEST_ID] = id;
}

export function getRequestId(req: Request): string | undefined {
  return (req as RequestWithId)[REQUEST_ID];
}
