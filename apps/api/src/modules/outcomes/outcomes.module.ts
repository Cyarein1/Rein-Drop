import { Module } from '@nestjs/common';
import { OutcomesService } from './outcomes.service.js';

/**
 * Outcomes - Reselling ledger: purchases (inventory), sales and costs.
 *
 * Owns: InventoryItem, Sale, Cost
 * OutcomesService records the purchase when a deal is marked Bought. Inventory, sales, costs and
 * realized P/L endpoints come with Build Prompt 28.
 */
@Module({
  providers: [OutcomesService],
  exports: [OutcomesService],
})
export class OutcomesModule {}
