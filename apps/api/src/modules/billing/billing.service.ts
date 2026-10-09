import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { BillingCheckoutRequest, BillingInfo, BillingPortalRequest, PlanPricing } from '@rein-drop/contracts';
import { Prisma, type PrismaClient, type SubscriptionStatus } from '@rein-drop/db';
import type { ProductEvents } from '@rein-drop/telemetry';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PRISMA } from '../../database/database.module.js';
import { PRODUCT_EVENTS } from '../telemetry/telemetry.tokens.js';
import type { BillingConfig } from './billing-config.js';
import { BILLING_PROVIDER, type BillingProvider, type BillingWebhookEvent, type ProviderSubscription } from './billing-provider.js';
import { DEV_FAKE_PROVIDER, ENTITLED_STATUSES, FREE_PROVIDER, STRIPE_PROVIDER, SubscriptionsService } from './subscriptions.service.js';

type StripeConfig = Extract<BillingConfig, { provider: 'stripe' }>;
/** A redelivery may take over an event stuck in PROCESSING (crashed worker) after this. */
const PROCESSING_LEASE_MS = 5 * 60_000;
const PRICE_CACHE_MS = 10 * 60_000;

export type WebhookOutcome = 'processed' | 'ignored' | 'duplicate';
/** Called after a user's subscription changed (e.g. Hunts enforces the new plan's limits). */
export type PlanChangedListener = (userId: string) => Promise<unknown>;

/**
 * Web billing (decision 0014): checkout and portal sessions, and the ONLY writer of paid
 * subscriptions - from verified webhooks. Every relevant event re-reads the subscription from
 * the provider, so redelivered, duplicated or out-of-order events all converge on the
 * provider's current state. Entitlements are then derived from Rein Drop's tables only.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private priceCache: { at: number; prices: Awaited<ReturnType<BillingProvider['getPrices']>> } | null = null;
  private readonly planChangedListeners: PlanChangedListener[] = [];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider | null,
    private readonly subscriptions: SubscriptionsService,
    @Inject(PRODUCT_EVENTS) private readonly events: ProductEvents,
  ) {}

  private stripe(): { provider: BillingProvider; config: StripeConfig } {
    if (this.config.billing.provider !== 'stripe' || !this.provider) {
      throw new AppException('NOT_FOUND', 'Online billing is not available here', HttpStatus.NOT_FOUND);
    }
    return { provider: this.provider, config: this.config.billing };
  }

  /**
   * Other modules react to plan changes without Billing depending on them (Hunts pauses hunts
   * above a lower plan's limit). Listeners must be idempotent: a redelivered event runs them again.
   */
  onPlanChanged(listener: PlanChangedListener): void {
    this.planChangedListeners.push(listener);
  }

  async info(userId: string): Promise<BillingInfo> {
    if (this.config.billing.provider !== 'stripe') return { mode: 'development', canManage: false };
    const customer = await this.prisma.billingCustomer.findUnique({ where: { provider_userId: { provider: STRIPE_PROVIDER, userId } } });
    return { mode: 'stripe', canManage: !!customer };
  }

  /** Pricing of a plan for the plan gate: free, the provider's current price, or TBD. */
  async pricing(plan: { code: string; isFree: boolean }): Promise<PlanPricing> {
    if (plan.isFree) return { status: 'free' };
    if (this.config.billing.provider !== 'stripe' || !this.provider) return { status: 'tbd' };
    const priceId = this.config.billing.priceIds[plan.code];
    if (!priceId) return { status: 'tbd' };
    return (await this.prices()).get(priceId) ?? { status: 'tbd' };
  }

  private async prices() {
    const now = Date.now();
    if (this.priceCache && now - this.priceCache.at < PRICE_CACHE_MS) return this.priceCache.prices;
    const { provider, config } = this.stripe();
    try {
      const prices = await provider.getPrices(Object.values(config.priceIds));
      this.priceCache = { at: now, prices };
      return prices;
    } catch (err) {
      // Stripe unreachable: show "TBD" (nothing can be bought) rather than fail the plan gate.
      this.logger.warn(`Could not load prices: ${describe(err)}`);
      return this.priceCache?.prices ?? new Map();
    }
  }

  /** Starts a hosted checkout for a paid plan. Nothing is granted until the webhook confirms payment. */
  async checkout(user: { userId: string; email: string }, request: BillingCheckoutRequest): Promise<string> {
    const { provider, config } = this.stripe();
    const plan = await this.prisma.plan.findFirst({ where: { code: request.planCode, isActive: true, isDevelopmentOnly: false } });
    if (!plan) throw new AppException('NOT_FOUND', `Plan "${request.planCode}" is not available`, HttpStatus.NOT_FOUND);
    if (plan.isFree) throw new AppException('BAD_REQUEST', 'The Free plan needs no checkout', HttpStatus.BAD_REQUEST);
    const priceId = config.priceIds[plan.code];
    if (!priceId || !(await this.prices()).has(priceId)) {
      throw new AppException('CONFLICT', `The ${plan.name} plan can't be bought yet (no price is set)`, HttpStatus.CONFLICT);
    }
    if (await this.subscriptions.currentPaid(user.userId)) {
      throw new AppException('CONFLICT', 'You already have a paid plan - change it in billing instead', HttpStatus.CONFLICT);
    }
    const customerId = await this.customerFor(provider, user);
    const back = `${config.webAppUrl}${request.returnPath}`;
    const join = back.includes('?') ? '&' : '?';
    const url = await provider.createCheckout({
      customerId,
      priceId,
      userId: user.userId,
      planCode: plan.code,
      successUrl: `${back}${join}checkout=success`,
      cancelUrl: `${back}${join}checkout=cancelled`,
    });
    // The choice, not the payment: the plan itself only changes when the webhook confirms it.
    this.events.track('plan_selected', user.userId, { planCode: plan.code, method: 'checkout' });
    return url;
  }

  /** The hosted portal: payment method, invoices, change plan, cancel. */
  async portal(userId: string, request: BillingPortalRequest): Promise<string> {
    const { provider, config } = this.stripe();
    const customer = await this.prisma.billingCustomer.findUnique({ where: { provider_userId: { provider: STRIPE_PROVIDER, userId } } });
    if (!customer) throw new AppException('NOT_FOUND', 'There is no billing account to manage yet', HttpStatus.NOT_FOUND);
    const paid = await this.subscriptions.currentPaid(userId);
    return provider.createPortal({
      customerId: customer.providerCustomerId,
      returnUrl: `${config.webAppUrl}${request.returnPath}`,
      flow: request.flow,
      subscriptionId: paid?.providerSubscriptionId ?? null,
    });
  }

  private async customerFor(provider: BillingProvider, user: { userId: string; email: string }): Promise<string> {
    const where = { provider_userId: { provider: STRIPE_PROVIDER, userId: user.userId } };
    const existing = await this.prisma.billingCustomer.findUnique({ where });
    if (existing) return existing.providerCustomerId;
    // Idempotent at Stripe per user, so a race returns the same customer id.
    const providerCustomerId = await provider.createCustomer({ id: user.userId, email: user.email });
    try {
      await this.prisma.billingCustomer.create({ data: { userId: user.userId, provider: STRIPE_PROVIDER, providerCustomerId } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return providerCustomerId;
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Handles one verified event at most once: recorded by provider event id; a redelivery of a
   * PROCESSED / IGNORED event is acknowledged without work; a FAILED one is processed again.
   * Throws when processing fails so the provider retries.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
    const { provider } = this.stripe();
    const event = provider.parseWebhook(rawBody, signature); // throws WebhookSignatureError
    if (!(await this.claim(event))) return 'duplicate';
    try {
      if (!event.subscriptionId) {
        await this.finish(event, 'IGNORED');
        return 'ignored';
      }
      const subscription = await provider.getSubscription(event.subscriptionId);
      const userId = await this.sync(event.subscriptionId, subscription);
      if (!userId) {
        // Not a Rein Drop customer (e.g. `stripe trigger` fixtures or another product on the account).
        await this.finish(event, 'IGNORED');
        return 'ignored';
      }
      // A failure here fails the event, so the provider redelivers it and enforcement runs again.
      for (const listener of this.planChangedListeners) await listener(userId);
      await this.finish(event, 'PROCESSED');
      return 'processed';
    } catch (err) {
      await this.prisma.billingEvent.update({
        where: { provider_providerEventId: { provider: STRIPE_PROVIDER, providerEventId: event.id } },
        data: { status: 'FAILED', error: describe(err).slice(0, 1000) },
      });
      this.logger.error(`Billing event ${event.id} (${event.type}) failed: ${describe(err)}`);
      throw err;
    }
  }

  /** True when this delivery should process the event (new, failed before, or a stale claim). */
  private async claim(event: BillingWebhookEvent): Promise<boolean> {
    const key = { provider: STRIPE_PROVIDER, providerEventId: event.id };
    const created = await this.prisma.billingEvent.createMany({
      data: [{ ...key, type: event.type, subjectId: event.subscriptionId }],
      skipDuplicates: true,
    });
    if (created.count === 1) return true;
    const retaken = await this.prisma.billingEvent.updateMany({
      where: {
        ...key,
        OR: [{ status: 'FAILED' }, { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - PROCESSING_LEASE_MS) } }],
      },
      data: { status: 'PROCESSING', error: null, attempts: { increment: 1 } },
    });
    return retaken.count === 1;
  }

  private finish(event: BillingWebhookEvent, status: 'PROCESSED' | 'IGNORED') {
    return this.prisma.billingEvent.update({
      where: { provider_providerEventId: { provider: STRIPE_PROVIDER, providerEventId: event.id } },
      data: { status, processedAt: new Date(), error: null },
    });
  }

  /**
   * Mirrors the provider's current subscription into Rein Drop (idempotent). Returns the user it
   * belongs to, or null when it isn't a Rein Drop customer's (nothing is written).
   */
  async sync(subscriptionId: string, sub: ProviderSubscription | null): Promise<string | null> {
    const { config } = this.stripe();
    if (!sub) {
      // Gone at the provider: end it here too.
      const existing = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: subscriptionId }, select: { userId: true, status: true, cancelAtPeriodEnd: true, plan: { select: { code: true } } } });
      await this.prisma.subscription.updateMany({
        where: { provider: STRIPE_PROVIDER, providerSubscriptionId: subscriptionId },
        data: { status: 'EXPIRED', currentPeriodEnd: new Date() },
      });
      if (existing) this.trackCancellation(existing.userId, existing, { status: 'EXPIRED', cancelAtPeriodEnd: existing.cancelAtPeriodEnd }, existing.plan.code);
      return existing?.userId ?? null;
    }
    const userId = await this.userFor(sub);
    if (!userId) return null;
    const planCode = Object.entries(config.priceIds).find(([, price]) => price === sub.priceId)?.[0];
    // Unknown price (config out of date): fail so the provider retries once the config is fixed.
    if (!planCode) throw new Error(`Subscription ${sub.id} is on price ${sub.priceId ?? 'none'}, which is not in STRIPE_PRICE_IDS`);
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new Error(`STRIPE_PRICE_IDS names plan "${planCode}", which does not exist`);

    const data = {
      userId,
      planId: plan.id,
      provider: STRIPE_PROVIDER,
      status: sub.status,
      providerPriceId: sub.priceId,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt,
    };
    const before = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.subscription.findUnique({
        where: { providerSubscriptionId: sub.id },
        select: { status: true, cancelAtPeriodEnd: true, plan: { select: { code: true } } },
      });
      await tx.subscription.upsert({ where: { providerSubscriptionId: sub.id }, create: { ...data, providerSubscriptionId: sub.id }, update: data });
      // A paid plan replaces the Free / development choice (one current subscription per user).
      if ((ENTITLED_STATUSES as string[]).includes(sub.status)) {
        await tx.subscription.updateMany({
          where: { userId, provider: { in: [FREE_PROVIDER, DEV_FAKE_PROVIDER] }, status: { in: ENTITLED_STATUSES } },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }
      return previous;
    });
    if (before) this.trackCancellation(userId, before, sub, before.plan.code);
    return userId;
  }

  /**
   * cancellation from the CHANGE between the stored and the provider's state, so redelivered or
   * duplicate webhooks never count it twice: "scheduled" when cancel-at-period-end is switched on,
   * "ended" when an entitled subscription stops being entitled by cancellation / expiry.
   */
  private trackCancellation(
    userId: string,
    before: { status: SubscriptionStatus; cancelAtPeriodEnd: boolean },
    after: { status: SubscriptionStatus; cancelAtPeriodEnd: boolean },
    planCode: string,
  ) {
    const entitled = (s: SubscriptionStatus) => ENTITLED_STATUSES.includes(s);
    if (entitled(before.status) && (after.status === 'CANCELED' || after.status === 'EXPIRED')) {
      this.events.track('cancellation', userId, { planCode, kind: 'ended' });
    } else if (!before.cancelAtPeriodEnd && after.cancelAtPeriodEnd && entitled(after.status)) {
      this.events.track('cancellation', userId, { planCode, kind: 'scheduled' });
    }
  }

  /** The Rein Drop user behind a provider subscription: by customer, else the checkout metadata; null if none. */
  private async userFor(sub: ProviderSubscription): Promise<string | null> {
    const customer = await this.prisma.billingCustomer.findUnique({
      where: { provider_providerCustomerId: { provider: STRIPE_PROVIDER, providerCustomerId: sub.customerId } },
    });
    if (customer) return customer.userId;
    if (sub.userId && (await this.prisma.user.findUnique({ where: { id: sub.userId }, select: { id: true } }))) {
      await this.prisma.billingCustomer.createMany({ data: [{ userId: sub.userId, provider: STRIPE_PROVIDER, providerCustomerId: sub.customerId }], skipDuplicates: true });
      return sub.userId;
    }
    this.logger.warn(`Subscription ${sub.id} belongs to customer ${sub.customerId}, which is not a Rein Drop user - ignored`);
    return null;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message.trim().split('\n')[0]! : String(err);
}
