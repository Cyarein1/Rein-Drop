import { Module } from '@nestjs/common';
import { marketplaceRegistryProvider } from './marketplace-registry.provider.js';

/**
 * Marketplaces - Marketplace registry and the adapter boundary to eBay / Facebook Marketplace (via @rein-drop/marketplace-core).
 *
 * Owns: Marketplace
 * Domain code must not call marketplace APIs directly - only through adapters registered here.
 *
 * Exports `MarketplaceRegistry` (from @rein-drop/marketplace-core): inject it to get the
 * MarketplaceAdapter for a marketplace. Concrete adapters are chosen in
 * marketplace-registry.provider.ts and nowhere else (enforced by src/architecture.spec.ts).
 */
@Module({
  providers: [marketplaceRegistryProvider],
  exports: [marketplaceRegistryProvider],
})
export class MarketplacesModule {}
