import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module.js';
import { OutcomesModule } from '../outcomes/outcomes.module.js';
import { DealsController } from './deals.controller.js';
import { DealsService } from './deals.service.js';

/**
 * Deals - the user-facing view of hunt matches: ranked feed, detail, Seen / Save / Ignore / Bought.
 *
 * Owns: SavedDeal. Reads HuntMatch, Listing, DealAnalysis, InventoryItem and polling state as a
 * composed read model; writes to Matching (decisions) and Outcomes (purchase) through their
 * services.
 * Endpoints: GET /deals, GET /deals/:id, POST /deals/:id/{seen,save,ignore,bought},
 * DELETE /deals/:id/{save,ignore}.
 */
@Module({
  imports: [MatchingModule, OutcomesModule],
  controllers: [DealsController],
  providers: [DealsService],
})
export class DealsModule {}
