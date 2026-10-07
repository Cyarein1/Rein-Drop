import { HttpStatus, Logger } from '@nestjs/common';
import { DEV_AUTH_HEADER } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { AppException } from '../common/errors/app.exception.js';
import type { NodeEnv } from '@rein-drop/env';
import type { AuthProvider, AuthRequest, AuthResult } from './auth.types.js';
import { isLoopbackOrPrivateAddress } from './private-network.js';

const SUBJECT_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * DEVELOPMENT-ONLY AuthProvider.
 *
 * - No passwords: the caller names a seeded user via the `x-dev-auth-subject`
 *   header (an identity selector, not a secret). `pnpm db:seed` creates the
 *   default user outside production.
 * - No public exposure: requests are only accepted from loopback / private
 *   network addresses (phones on the same Wi-Fi are allowed, the internet is not).
 * - Never in production: config refuses AUTH_PROVIDER=dev with NODE_ENV=production,
 *   and this constructor refuses again as defense in depth.
 */
export class DevAuthProvider implements AuthProvider {
  readonly id = 'dev' as const;
  private readonly logger = new Logger(DevAuthProvider.name);

  constructor(
    private readonly prisma: PrismaClient,
    nodeEnv: NodeEnv,
  ) {
    if (nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('DevAuthProvider is development-only and must never be constructed in production');
    }
    this.logger.warn(
      'DEVELOPMENT-ONLY auth is active: requests from this machine or the local network can act as seeded users',
    );
  }

  async authenticate(request: AuthRequest): Promise<AuthResult> {
    if (!isLoopbackOrPrivateAddress(request.remoteAddress)) {
      return {
        status: 'forbidden',
        reason: 'Development sign-in is only available from this machine or the local network',
      };
    }

    const raw = request.headers[DEV_AUTH_HEADER];
    const subject = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!subject) {
      return { status: 'anonymous', reason: `Sign in required (development: send the ${DEV_AUTH_HEADER} header)` };
    }
    if (!SUBJECT_PATTERN.test(subject)) {
      return { status: 'anonymous', reason: `Invalid ${DEV_AUTH_HEADER} value` };
    }

    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { authProvider_authSubject: { authProvider: this.id, authSubject: subject } },
        select: { id: true, email: true, displayName: true },
      });
    } catch (err) {
      this.logger.warn(`Dev auth lookup failed: ${err instanceof Error ? err.message.trim().split('\n')[0] : String(err)}`);
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'Cannot verify identity right now: the database is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!user) {
      return { status: 'anonymous', reason: `No development user "${subject}" - run pnpm db:seed` };
    }
    return {
      status: 'authenticated',
      principal: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        provider: this.id,
        subject,
      },
    };
  }
}
