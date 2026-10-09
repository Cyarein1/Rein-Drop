import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SecurityHeadersMiddleware } from './common/http/security.js';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware.js';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from './config/api-config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { DOMAIN_MODULES } from './modules/index.js';

@Module({})
export class AppModule implements NestModule {
  /** Config is validated before Nest starts (see main.ts) and provided globally. */
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      // AuthModule registers the global AuthGuard: every route is protected unless @Public().
      imports: [DatabaseModule, AuthModule, ...DOMAIN_MODULES],
      controllers: [HealthController],
      providers: [
        { provide: API_CONFIG, useValue: config },
        // Registered here (not in main.ts) so tests using AppModule get the same behavior.
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [API_CONFIG],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
