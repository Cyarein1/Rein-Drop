import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { PrismaClient } from '@rein-drop/db';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PRISMA } from '../database/database.module.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AUTH_PROVIDER, type AuthProvider } from './auth.types.js';
import { DevAuthProvider } from './dev-auth.provider.js';

/**
 * Selects the AuthProvider from config and protects every route by default.
 * TODO(auth): add the managed provider here as a new `case` once it is chosen.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH_PROVIDER,
      inject: [API_CONFIG, PRISMA],
      useFactory: (config: ApiConfig, prisma: PrismaClient): AuthProvider => {
        switch (config.authProvider) {
          case 'dev':
            return new DevAuthProvider(prisma, config.nodeEnv);
        }
      },
    },
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
