import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { HuntPlanLimits } from './hunt-plan-limits.js';
import { HuntsController } from './hunts.controller.js';
import { HuntsService } from './hunts.service.js';

/**
 * Hunts - Saved sourcing searches and which marketplaces each searches.
 *
 * Owns: Hunt, HuntMarketplace, HuntEvent
 * Lifecycle: DRAFT -> LIVE <-> PAUSED; any -> ARCHIVED -> (restore) DRAFT/PAUSED. Never
 * deleted; edits keep the id and are recorded as HuntEvents.
 * Going live is checked against the user's plan (PlansService) - blocked activations return
 * ACTIVATION_BLOCKED with structured reasons and leave the hunt unchanged. When billing changes the
 * plan, LIVE hunts above the new limit are paused (HuntPlanLimits).
 * Endpoints: GET/POST /hunts, GET/PATCH /hunts/:id, GET /hunts/:id/events,
 * GET /hunts/:id/activation-check, GET /hunts/activity, GET /hunts/:id/activity (monitoring state +
 * performance counts), POST /hunts/:id/{activate,pause,resume,archive,restore}.
 */
@Module({
  imports: [PlansModule, BillingModule],
  controllers: [HuntsController],
  providers: [HuntsService, HuntPlanLimits],
  exports: [HuntsService],
})
export class HuntsModule {}
