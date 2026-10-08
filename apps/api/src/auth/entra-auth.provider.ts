import { HttpStatus, Logger } from '@nestjs/common';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { entraDiscoveryUrl } from '@rein-drop/contracts';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import { AppException } from '../common/errors/app.exception.js';
import type { AuthProvider, AuthRequest, AuthResult, Principal } from './auth.types.js';

/** What the API needs to verify Microsoft Entra External ID access tokens (decision 0013). */
export interface EntraApiConfig {
  /** https://<tenant-subdomain>.ciamlogin.com */
  authority: string;
  /** Directory (tenant) ID, a GUID. Tokens from any other tenant are refused. */
  tenantId: string;
  /** Application (client) ID of the Rein Drop API registration = the v2.0 token audience. */
  audience: string;
  /** Delegated scope every user token must carry (e.g. "access_as_user"). */
  requiredScope: string;
}

/** Test seams: a fixed issuer + key set instead of the tenant's discovery document. */
export interface EntraVerificationKeys {
  issuer: string;
  keys: JWTVerifyGetKey;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Clock skew tolerated on exp / nbf, seconds. */
const CLOCK_TOLERANCE_S = 60;

/**
 * Microsoft Entra External ID AuthProvider. Verifies the bearer access token the web / mobile
 * apps obtained for this API (Microsoft identity platform guidance):
 * - signature against the tenant's published keys (jwks_uri from its OpenID configuration,
 *   cached and re-fetched on key rollover), RS256 only;
 * - `iss` exactly the tenant's issuer, `aud` this API's client ID, `exp` / `nbf`, `tid` the tenant;
 * - the required delegated scope in `scp` (user tokens only - app-only tokens have none).
 *
 * Identity mapping: the user's `oid` (immutable, the same across the tenant's apps) is
 * User.authSubject with authProvider "entra". First sign-in creates the Rein Drop user from the
 * token's `email` (an optional claim the API registration must emit) and `name`. An email that
 * already belongs to another user is refused - accounts are never linked by email.
 */
export class EntraAuthProvider implements AuthProvider {
  readonly id = 'entra' as const;
  private readonly logger = new Logger(EntraAuthProvider.name);
  private verification: Promise<EntraVerificationKeys> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: EntraApiConfig,
    keys?: EntraVerificationKeys,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (keys) this.verification = Promise.resolve(keys);
  }

  async authenticate(request: AuthRequest): Promise<AuthResult> {
    const raw = request.headers.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return { status: 'anonymous', reason: 'Sign in required' };

    const { issuer, keys } = await this.loadVerification();
    let claims: JWTPayload;
    try {
      ({ payload: claims } = await jwtVerify(token, keys, {
        issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_S,
        requiredClaims: ['exp', 'iat'],
      }));
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) return { status: 'anonymous', reason: 'Your session has expired - sign in again' };
      if (err instanceof joseErrors.JWKSTimeout || isNetworkError(err)) {
        this.logger.warn(`Could not fetch Entra signing keys: ${describe(err)}`);
        throw new AppException('SERVICE_UNAVAILABLE', 'Cannot verify identity right now', HttpStatus.SERVICE_UNAVAILABLE);
      }
      // Never echo the token; the error code is enough to debug (wrong audience, signature, ...).
      return { status: 'anonymous', reason: `Invalid access token (${err instanceof joseErrors.JOSEError ? err.code : 'unreadable'})` };
    }

    if (claims.tid !== this.config.tenantId) return { status: 'anonymous', reason: 'Invalid access token (wrong tenant)' };
    const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ') : [];
    if (!scopes.includes(this.config.requiredScope)) {
      return { status: 'forbidden', reason: `The access token does not grant the "${this.config.requiredScope}" scope` };
    }
    const oid = claims.oid;
    if (typeof oid !== 'string' || !GUID.test(oid)) return { status: 'anonymous', reason: 'Invalid access token (no user object id)' };

    const email = typeof claims.email === 'string' && EMAIL.test(claims.email.trim()) ? claims.email.trim().toLowerCase() : null;
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 200) : null;
    return this.resolveUser(oid, email, name);
  }

  /** Finds (or on first sign-in creates) the Rein Drop user for this Entra identity. */
  private async resolveUser(oid: string, email: string | null, name: string | null): Promise<AuthResult> {
    const where = { authProvider_authSubject: { authProvider: this.id, authSubject: oid } };
    const select = { id: true, email: true, displayName: true } as const;
    try {
      const existing = await this.prisma.user.findUnique({ where, select });
      if (existing) return this.authenticated(existing, oid);

      if (!email) {
        return {
          status: 'forbidden',
          reason: 'The access token has no email claim - add the optional "email" claim to the API app registration (access tokens)',
        };
      }
      try {
        const created = await this.prisma.user.create({
          data: { email, displayName: name, authProvider: this.id, authSubject: oid },
          select,
        });
        this.logger.log(`Created user ${created.id} for a new Entra identity`);
        return this.authenticated(created, oid);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        // Either a parallel first request created this identity, or the email is someone else's.
        const raced = await this.prisma.user.findUnique({ where, select });
        if (raced) return this.authenticated(raced, oid);
        return { status: 'forbidden', reason: 'An account with this email already exists under another sign-in method' };
      }
    } catch (err) {
      this.logger.warn(`Entra user lookup failed: ${describe(err)}`);
      throw new AppException('SERVICE_UNAVAILABLE', 'Cannot verify identity right now: the database is unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private authenticated(user: { id: string; email: string; displayName: string | null }, oid: string): AuthResult {
    const principal: Principal = { userId: user.id, email: user.email, displayName: user.displayName, provider: this.id, subject: oid };
    return { status: 'authenticated', principal };
  }

  /** The tenant's issuer and signing keys, from its OpenID configuration (cached; retried after a failure). */
  private loadVerification(): Promise<EntraVerificationKeys> {
    this.verification ??= this.discover().catch((err: unknown) => {
      this.verification = null;
      this.logger.warn(`Entra discovery failed: ${describe(err)}`);
      throw new AppException('SERVICE_UNAVAILABLE', 'Cannot verify identity right now', HttpStatus.SERVICE_UNAVAILABLE);
    });
    return this.verification;
  }

  private async discover(): Promise<EntraVerificationKeys> {
    const res = await this.fetchImpl(entraDiscoveryUrl(this.config.authority, this.config.tenantId), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`OpenID configuration returned HTTP ${res.status}`);
    const doc = (await res.json()) as { issuer?: unknown; jwks_uri?: unknown };
    if (typeof doc.issuer !== 'string' || typeof doc.jwks_uri !== 'string') throw new Error('OpenID configuration has no issuer / jwks_uri');
    // The issuer must belong to the configured tenant (no multi-tenant templates).
    if (!doc.issuer.includes(this.config.tenantId)) throw new Error(`Unexpected issuer ${doc.issuer}`);
    return { issuer: doc.issuer, keys: createRemoteJWKSet(new URL(doc.jwks_uri), { timeoutDuration: 10_000 }) };
  }
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/.test(err.message));
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message.trim().split('\n')[0]! : String(err);
}
