import { DynamicModule, Module } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from './config/api-config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({})
export class AppModule {
  /** Config is validated before Nest starts (see main.ts) and provided globally. */
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DatabaseModule],
      controllers: [HealthController],
      providers: [{ provide: API_CONFIG, useValue: config }],
      exports: [API_CONFIG],
    };
  }
}
