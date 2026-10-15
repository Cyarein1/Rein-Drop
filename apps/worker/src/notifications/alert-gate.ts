import { enforceActiveHuntLimit, hasProduct, isSuspended, type AccessPolicy } from '@rein-drop/access';
import type { NotificationCategory } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';

/** Categories that come from sourcing monitoring (Hunts) - only sent while the account may run that Hunt. */
const SOURCING_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['deal_alerts', 'exceptional_deals']);

export type GateDecision = { send: true } | { send: false; reason: 'account_suspended' | 'no_access' | 'hunt_not_live' };

export interface AlertGateInput {
  userId: string;
  category: NotificationCategory;
  huntId: string | null;
}

/**
 * Checked right before an external delivery (push / email) is handed to its provider - not only
 * when the alert was written - so a pause, suspension or lapsed plan between the two (the outbox
 * may wait or retry) stops it. In-app alerts are unaffected: the inbox keeps the record.
 */
export interface AlertGate {
  check(input: AlertGateInput, now: Date): Promise<GateDecision>;
}

/**
 * Sourcing alerts go out only when (decision 0018 / ACCESS_RULES.md):
 * - the account isn't suspended;
 * - it still has Source access (the same resolver as the API, including BILLING_GRACE_DAYS);
 * - the Hunt is still LIVE after enforcing the plan's live-Hunt limit now - the same pause the
 *   scheduler's sweep would make a few minutes later, done eagerly so no Hunt above the limit
 *   can alert in between.
 */
export class AccessAlertGate implements AlertGate {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly policy: AccessPolicy,
  ) {}

  async check(input: AlertGateInput, now: Date): Promise<GateDecision> {
    if (!SOURCING_CATEGORIES.has(input.category)) return { send: true };
    if (await isSuspended(this.prisma, input.userId)) return { send: false, reason: 'account_suspended' };
    if (!(await hasProduct(this.prisma, input.userId, 'source', { now, policy: this.policy }))) return { send: false, reason: 'no_access' };
    if (input.huntId) {
      await enforceActiveHuntLimit(this.prisma, input.userId, now, this.policy);
      const hunt = await this.prisma.hunt.findUnique({ where: { id: input.huntId }, select: { status: true } });
      if (hunt?.status !== 'LIVE') return { send: false, reason: 'hunt_not_live' };
    }
    return { send: true };
  }
}

/** Lets everything through (unit tests that aren't about access). */
export const OPEN_GATE: AlertGate = { check: async () => ({ send: true }) };
