import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';

/** Opt a route or controller out of authentication (e.g. health checks). Everything else is protected. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

const PRINCIPAL = Symbol('principal');
type RequestWithPrincipal = Request & { [PRINCIPAL]?: Principal };

export function setPrincipal(req: Request, principal: Principal): void {
  (req as RequestWithPrincipal)[PRINCIPAL] = principal;
}

export function getPrincipal(req: Request): Principal | undefined {
  return (req as RequestWithPrincipal)[PRINCIPAL];
}

/** The authenticated caller. Only valid on protected routes (the guard guarantees it is set). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const principal = getPrincipal(ctx.switchToHttp().getRequest<Request>());
  if (!principal) {
    throw new Error('@CurrentUser() used on a route without authentication (is it marked @Public()?)');
  }
  return principal;
});
