import { Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../auth/decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { WebhookSignatureError } from './billing-provider.js';
import { BillingService, type WebhookOutcome } from './billing.service.js';

/**
 * Stripe webhook endpoint - public: authenticated by the signature over the raw body, not a user.
 * 400 for a bad signature; 500 when processing fails, so Stripe retries; 200 otherwise -
 * including duplicates, which are acknowledged without being processed again.
 */
@Controller('billing/webhooks')
export class BillingWebhooksController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  // Stripe sends bursts (and retries); the signature, not a rate limit, protects this route.
  @SkipThrottle()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true; outcome: WebhookOutcome }> {
    if (!req.rawBody) throw new Error('Raw request bodies are not enabled (create the app with rawBody: true)');
    try {
      return { received: true, outcome: await this.billing.handleWebhook(req.rawBody, signature) };
    } catch (err) {
      if (err instanceof WebhookSignatureError) throw new AppException('BAD_REQUEST', 'Invalid webhook signature', HttpStatus.BAD_REQUEST);
      throw err;
    }
  }
}
