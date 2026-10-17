import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module.js';
import { OutcomesController } from './outcomes.controller.js';
import { OutcomesService } from './outcomes.service.js';

/**
 * Outcomes - Reselling ledger: purchases (inventory), sales and costs, the item lifecycle
 * (decision 0021 - nothing deleted) and the item event history.
 *
 * Owns: InventoryItem, Sale, Cost, InventoryEvent
 * OutcomesService records the purchase when a deal is marked Bought (Deals calls it); Sell
 * registers an exit listener so a sale / return / write-off ends the item's marketplace listings.
 * Cancelling a deal's item re-opens the deal through MatchingService.
 * Endpoints: GET|POST /inventory, GET|PATCH /inventory/:id, GET /inventory/:id/events,
 * PUT /inventory/:id/purchase-costs, PUT|DELETE /inventory/:id/sale,
 * POST /inventory/:id/{return,write-off,cancel,reopen}.
 */
@Module({
  imports: [MatchingModule],
  controllers: [OutcomesController],
  providers: [OutcomesService],
  exports: [OutcomesService],
})
export class OutcomesModule {}
