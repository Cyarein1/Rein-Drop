import { Module } from '@nestjs/common';
import { DevBillingController } from './dev-billing.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Billing - Subscriptions and the billing-provider integration.
 *
 * Owns: Subscription
 * TODO(billing): provider TBD (Stripe leading candidate); mobile billing TBD. Prices are not
 * modelled until decided. NO real billing is integrated.
 * Endpoints: POST /billing/dev/confirm - DEVELOPMENT-ONLY fake checkout (404 in production).
 *
 * Exports SubscriptionsService (which plan a user is on) for the Plans module.
 */
@Module({
  controllers: [DevBillingController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class BillingModule {}
