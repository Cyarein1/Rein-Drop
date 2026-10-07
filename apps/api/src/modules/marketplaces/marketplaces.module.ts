import { Module } from '@nestjs/common';

/**
 * Marketplaces - Marketplace registry and the adapter boundary to eBay / Facebook Marketplace (via @rein-drop/marketplace-core).
 *
 * Owns: Marketplace
 * Domain code must not call marketplace APIs directly - only through adapters registered here.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class MarketplacesModule {}
