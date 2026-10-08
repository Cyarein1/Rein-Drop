import { Module } from '@nestjs/common';
import { OutcomesController } from './outcomes.controller.js';
import { OutcomesService } from './outcomes.service.js';

/**
 * Outcomes - Reselling ledger: purchases (inventory), sales and costs.
 *
 * Owns: InventoryItem, Sale, Cost
 * OutcomesService records the purchase when a deal is marked Bought (Deals calls it).
 * Endpoints: GET /inventory, GET /inventory/:id, PATCH /inventory/:id,
 * PUT /inventory/:id/purchase-costs, PUT /inventory/:id/sale, DELETE /inventory/:id/sale.
 */
@Module({
  controllers: [OutcomesController],
  providers: [OutcomesService],
  exports: [OutcomesService],
})
export class OutcomesModule {}
