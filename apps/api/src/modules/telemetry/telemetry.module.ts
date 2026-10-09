import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { createProductEventProvider, ProductEvents, type ProductEventProvider } from '@rein-drop/telemetry';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { TelemetryController } from './telemetry.controller.js';
import { PRODUCT_EVENT_PROVIDER, PRODUCT_EVENTS } from './telemetry.tokens.js';

export { PRODUCT_EVENT_PROVIDER, PRODUCT_EVENTS };

@Injectable()
class ProductEventsLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRODUCT_EVENTS) private readonly events: ProductEvents) {}

  async onApplicationShutdown() {
    await this.events.shutdown();
  }
}

/**
 * Telemetry - product events for the beta (Build Prompt 43). Cross-cutting and global: domain
 * services record events where the state changes; the apps report only screen views through
 * POST /telemetry/events. Owns no tables. Catalog + privacy rules: contracts product-events.ts.
 */
@Global()
@Module({
  controllers: [TelemetryController],
  providers: [
    {
      provide: PRODUCT_EVENT_PROVIDER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => {
        const logger = new Logger('ProductEvents');
        return createProductEventProvider(config.productEvents, (entry) => logger.log(entry), config.logFormat);
      },
    },
    {
      provide: PRODUCT_EVENTS,
      inject: [PRODUCT_EVENT_PROVIDER],
      useFactory: (provider: ProductEventProvider) => {
        const logger = new Logger('ProductEvents');
        return new ProductEvents(provider, { source: 'api', onProblem: (message) => logger.warn(message) });
      },
    },
    ProductEventsLifecycle,
  ],
  exports: [PRODUCT_EVENTS],
})
export class TelemetryModule {}
