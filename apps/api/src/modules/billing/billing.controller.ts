import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  billingCheckoutRequestSchema,
  billingPortalRequestSchema,
  type BillingInfo,
  type BillingRedirect,
  type SubscriptionSummary,
} from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

class CheckoutDto extends createZodDto(billingCheckoutRequestSchema) {}
class PortalDto extends createZodDto(billingPortalRequestSchema) {}

/**
 * Web billing for the signed-in user (decision 0014). Checkout and the portal are hosted by the
 * provider; the plan only changes when its verified webhook arrives (server-owned entitlements).
 */
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** How plans are bought here (stripe | development) and whether there is billing to manage. */
  @Get()
  info(@CurrentUser() user: Principal): Promise<BillingInfo> {
    return this.billing.info(user.userId);
  }

  /** Hosted checkout for a paid plan; the client sends the browser to `url`. */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(@CurrentUser() user: Principal, @Body() body: CheckoutDto): Promise<BillingRedirect> {
    return { url: await this.billing.checkout({ userId: user.userId, email: user.email }, body) };
  }

  /** Hosted billing portal: payment method, invoices, change plan, cancel. */
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  async portal(@CurrentUser() user: Principal, @Body() body: PortalDto): Promise<BillingRedirect> {
    return { url: await this.billing.portal(user.userId, body) };
  }

  /** Choose the Free plan (no card, no charge) - works in every billing mode. */
  @Post('free')
  @HttpCode(HttpStatus.OK)
  async free(@CurrentUser() user: Principal): Promise<{ subscription: SubscriptionSummary }> {
    return { subscription: await this.subscriptions.chooseFree(user.userId) };
  }
}
