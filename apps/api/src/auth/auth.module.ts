import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { PrismaClient } from '@rein-drop/db';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PRISMA } from '../database/database.module.js';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AUTH_PROVIDER, type AuthProvider } from './auth.types.js';
import { DevAuthProvider } from './dev-auth.provider.js';
import { EntraAuthProvider } from './entra-auth.provider.js';

/**
 * Selects the AuthProvider from config and protects every route by default, then rate-limits per
 * user (RateLimitGuard - registered after AuthGuard so it can count by user).
 * Production can only use `entra`: config refuses `dev`, and so does this factory.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => ({ throttlers: [{ name: 'default', ttl: 60_000, limit: config.rateLimitPerMinute }] }),
    }),
  ],
  providers: [
    {
      provide: AUTH_PROVIDER,
      inject: [API_CONFIG, PRISMA],
      useFactory: (config: ApiConfig, prisma: PrismaClient): AuthProvider => {
        switch (config.authProvider) {
          case 'dev':
            if (config.nodeEnv === 'production') throw new Error('Development auth is not available in production');
            return new DevAuthProvider(prisma, config.nodeEnv);
          case 'entra':
            if (!config.entra) throw new Error('AUTH_PROVIDER=entra needs ENTRA_AUTHORITY, ENTRA_TENANT_ID and ENTRA_API_CLIENT_ID');
            return new EntraAuthProvider(prisma, config.entra);
        }
      },
    },
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
