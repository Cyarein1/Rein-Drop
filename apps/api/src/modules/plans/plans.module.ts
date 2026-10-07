import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

/**
 * Plans - Plans and entitlements: what each plan grants.
 *
 * Owns: Plan, Entitlement
 * Seeded limits are PLACEHOLDERS (`limitsFinal: false`) until the cost model is done;
 * prices are not modelled. Endpoints: GET /plans.
 * Exports PlansService (`planForUser`) - Hunts enforces it at activation.
 */
@Module({
  imports: [BillingModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
