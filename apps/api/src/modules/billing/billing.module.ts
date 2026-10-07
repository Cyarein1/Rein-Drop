import { Module } from '@nestjs/common';

/**
 * Billing - Subscriptions and the billing-provider integration.
 *
 * Owns: Subscription
 * TODO(billing): provider TBD (Stripe leading candidate); mobile billing TBD.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class BillingModule {}
