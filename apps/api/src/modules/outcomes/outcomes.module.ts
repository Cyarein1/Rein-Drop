import { Module } from '@nestjs/common';

/**
 * Outcomes - Reselling ledger: purchases (inventory), sales and costs.
 *
 * Owns: InventoryItem, Sale, Cost
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class OutcomesModule {}
