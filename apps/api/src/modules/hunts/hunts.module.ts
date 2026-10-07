import { Module } from '@nestjs/common';
import { HuntsController } from './hunts.controller.js';
import { HuntsService } from './hunts.service.js';

/**
 * Hunts - Saved sourcing searches and which marketplaces each searches.
 *
 * Owns: Hunt, HuntMarketplace, HuntEvent
 * Lifecycle: DRAFT -> LIVE <-> PAUSED; any -> ARCHIVED. Never deleted; edits keep the id and
 * are recorded as HuntEvents.
 * Endpoints: GET/POST /hunts, GET/PATCH /hunts/:id, GET /hunts/:id/events,
 * POST /hunts/:id/{activate,pause,resume,archive}.
 * TODO(plan-gate): entitlement checks at activation.
 */
@Module({
  controllers: [HuntsController],
  providers: [HuntsService],
  exports: [HuntsService],
})
export class HuntsModule {}
