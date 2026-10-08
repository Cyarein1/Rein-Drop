import { Module } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { BillingController } from './billing.controller.js';
import { BILLING_PROVIDER, type BillingProvider } from './billing-provider.js';
import { BillingWebhooksController } from './billing-webhooks.controller.js';
import { BillingService } from './billing.service.js';
import { DevBillingController } from './dev-billing.controller.js';
import { StripeBillingProvider } from './stripe-billing.provider.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Billing - subscriptions and the web billing provider (decision 0014).
 *
 * Owns: Subscription, BillingCustomer, BillingEvent.
 * Provider: Stripe (BILLING_PROVIDER=stripe) behind BillingProvider; the development fake
 * (BILLING_PROVIDER=dev, never in production) for local work. Prices live in Stripe, mapped to
 * plan codes by STRIPE_PRICE_IDS. Native store billing (App Store / Google Play) is not built.
 * Endpoints: GET /billing, POST /billing/{checkout,portal,free}, POST /billing/webhooks/stripe
 * (public, signed), POST /billing/dev/confirm (development only, 404 in production).
 *
 * Exports SubscriptionsService (which plan a user is on) and BillingService (plan pricing).
 */
@Module({
  controllers: [BillingController, BillingWebhooksController, DevBillingController],
  providers: [
    {
      provide: BILLING_PROVIDER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig): BillingProvider | null =>
        config.billing.provider === 'stripe' ? StripeBillingProvider.create(config.billing.secretKey, config.billing.webhookSecret) : null,
    },
    SubscriptionsService,
    BillingService,
  ],
  exports: [SubscriptionsService, BillingService],
})
export class BillingModule {}
