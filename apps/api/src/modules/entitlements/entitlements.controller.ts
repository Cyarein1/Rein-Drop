import { Controller, Get } from '@nestjs/common';
import type { EntitlementEvaluation } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { HuntsService } from '../hunts/hunts.service.js';
import { PlansService } from '../plans/plans.service.js';

/** The caller's plan, what it allows, current usage and what is left. */
@Controller('me/entitlements')
export class EntitlementsController {
  constructor(
    private readonly plans: PlansService,
    private readonly hunts: HuntsService,
  ) {}

  @Get()
  async evaluate(@CurrentUser() user: Principal): Promise<EntitlementEvaluation> {
    const [plan, activeHunts] = await Promise.all([
      this.plans.planForUser(user.userId),
      this.hunts.countLive(user.userId),
    ]);
    const limit = plan.entitlements.activeHunts.limit;
    return {
      plan: { code: plan.code, name: plan.name, pricing: plan.pricing, limitsFinal: plan.limitsFinal },
      entitlements: plan.entitlements,
      usage: { activeHunts },
      remaining: { activeHunts: limit === null ? null : Math.max(0, limit - activeHunts) },
    };
  }
}
