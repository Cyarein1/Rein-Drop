import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { BillingService } from '../billing/billing.service.js';
import { HuntsService } from './hunts.service.js';

/**
 * Keeps LIVE hunts within the user's plan when the plan changes through billing (a paid plan ends
 * or moves to a smaller one): Hunts subscribes to Billing, so Billing never writes hunts.
 */
@Injectable()
export class HuntPlanLimits implements OnModuleInit {
  private readonly logger = new Logger(HuntPlanLimits.name);

  constructor(
    private readonly billing: BillingService,
    private readonly hunts: HuntsService,
  ) {}

  onModuleInit(): void {
    this.billing.onPlanChanged(async (userId) => {
      const paused = await this.hunts.enforcePlanLimit(userId);
      if (paused.length > 0) this.logger.log(`Paused ${paused.length} hunt(s) of user ${userId} above their plan's limit`);
    });
  }
}
