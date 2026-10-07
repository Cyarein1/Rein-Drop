import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Billing - Subscriptions and the billing-provider integration.
 *
 * Owns: Subscription
 * TODO(billing): provider TBD (Stripe leading candidate); mobile billing TBD. Prices are not
 * modelled until decided.
 *
 * Exports SubscriptionsService (which plan a user is on) for the Plans module.
 */
@Module({
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class BillingModule {}
