import { Controller, Get } from '@nestjs/common';
import type { EntitlementEvaluation } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import { HuntsService } from '../hunts/hunts.service.js';
import { PlansService } from '../plans/plans.service.js';

/** The caller's subscription, plan, what it allows, current usage and what is left. */
@Controller('me/entitlements')
export class EntitlementsController {
  constructor(
    private readonly plans: PlansService,
    private readonly hunts: HuntsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  async evaluate(@CurrentUser() user: Principal): Promise<EntitlementEvaluation> {
    const [subscription, plan, activeHunts] = await Promise.all([
      this.subscriptions.current(user.userId),
      this.plans.planForUser(user.userId, undefined, true),
      this.hunts.countLive(user.userId),
    ]);
    const limit = plan.entitlements.activeHunts.limit;
    return {
      subscription,
      plan: { code: plan.code, name: plan.name, pricing: plan.pricing, limitsFinal: plan.limitsFinal },
      entitlements: plan.entitlements,
      usage: { activeHunts },
      remaining: { activeHunts: limit === null ? null : Math.max(0, limit - activeHunts) },
    };
  }
}
