import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { DeleteAccountResponse } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { BillingService } from '../billing/billing.service.js';
import { MEDIA_STORAGE, type MediaStorage } from '../sell/media-storage.js';

/**
 * Account deletion (Apple 5.1.1(v), Google Play, GDPR erasure) - the ONE real erase in Rein Drop
 * (decision 0021). Order, so a failure never leaves a paying subscription behind an erased account:
 *
 * 1. Billing: every subscription still open at Stripe is cancelled NOW and the Stripe customer is
 *    deleted (email, payment methods). Stripe keeps invoices / payments for its own legal retention.
 *    If Stripe can't be reached: 503, nothing is deleted (try again).
 * 2. Database: the User row is deleted; every table hanging off it cascades (profile, Hunts and
 *    their matches / events, alerts and deliveries, push devices and tickets, saved deals, inventory,
 *    item events, sales, costs, sell listings / photos / channels, subscriptions, billing customer,
 *    usage). Kept, because it holds no personal data: shared marketplace Listings and their
 *    analyses (public source data), BillingEvent rows (provider event ids only, no user link),
 *    search runs / jobs (internal ids only).
 * 3. Media: the seller's own listing photos are removed from media storage (best effort, logged).
 *
 * Suspended accounts (abuse / fraud / chargeback, data kept for retention) can't delete themselves:
 * 403 ACCOUNT_SUSPENDED - support handles it (open question for the owner, docs).
 * The sign-in identity (Entra External ID) is NOT deleted here (TODO(owner), docs): signing in again
 * starts a new, empty account.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly clock = () => new Date();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly billing: BillingService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
  ) {}

  async delete(userId: string): Promise<DeleteAccountResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, accessSuspendedAt: true } });
    if (!user) throw new AppException('NOT_FOUND', 'Account not found', HttpStatus.NOT_FOUND);
    if (user.accessSuspendedAt) {
      throw new AppException('ACCOUNT_SUSPENDED', 'This account is suspended - contact support to delete it', HttpStatus.FORBIDDEN);
    }

    let canceledSubscriptions: number;
    try {
      canceledSubscriptions = await this.billing.closeAccount(userId);
    } catch (err) {
      this.logger.warn(`Account deletion stopped - billing provider failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      throw new AppException('SERVICE_UNAVAILABLE', "Couldn't cancel your subscription right now, so nothing was deleted. Try again in a few minutes.", HttpStatus.SERVICE_UNAVAILABLE);
    }

    const photos = await this.prisma.sellPhoto.findMany({ where: { source: 'OWN', sellListing: { userId } }, select: { ref: true } });
    const { count } = await this.prisma.user.deleteMany({ where: { id: userId } }); // cascades everything personal
    for (const p of photos) {
      await this.media.delete(p.ref).catch((err: unknown) => this.logger.warn(`A deleted account's photo could not be removed: ${err instanceof Error ? err.message : String(err)}`));
    }
    const deletedAt = this.clock();
    // Internal id only - never the email.
    if (count === 1) this.logger.log(`Account ${userId} deleted (subscriptions cancelled: ${canceledSubscriptions}, photos: ${photos.length})`);
    return { deleted: true, deletedAt: deletedAt.toISOString(), canceledSubscriptions, signOut: true };
  }
}
