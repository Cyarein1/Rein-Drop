import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC, setPrincipal } from './decorators.js';

/** Global guard: every route requires authentication unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const result = await this.auth.authenticate({
      headers: req.headers,
      remoteAddress: req.socket.remoteAddress,
    });

    switch (result.status) {
      case 'authenticated':
        setPrincipal(req, result.principal);
        return true;
      case 'forbidden':
        throw new AppException('FORBIDDEN', result.reason, HttpStatus.FORBIDDEN);
      case 'anonymous':
        throw new AppException('UNAUTHORIZED', result.reason, HttpStatus.UNAUTHORIZED);
    }
  }
}
