import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';
import { ProductAccessGuard } from './requires-product.js';

/**
 * Access - the account's effective access per product (decision 0018), on the shared resolver in
 * @rein-drop/access (also used by the worker).
 *
 * Owns: User.accessSuspended* (read here; set by support tooling / SQL - no endpoint yet).
 * Global: Hunts call AccessService for suspension and the saved-Hunt limit; ProductAccessGuard
 * (APP_GUARD, after AuthGuard) enforces `@RequiresProduct(...)` on product routes (Sell).
 * Endpoints: GET /me/access.
 */
@Global()
@Module({
  controllers: [AccessController],
  providers: [AccessService, { provide: APP_GUARD, useClass: ProductAccessGuard }],
  exports: [AccessService],
})
export class AccessModule {}
