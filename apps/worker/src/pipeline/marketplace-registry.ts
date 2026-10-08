import type { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { createMarketplaceRegistry } from '@rein-drop/marketplace-core/adapters';
import type { WorkerConfig } from '../config/worker-config.js';

/** The only worker file that touches concrete adapters (via the shared factory). */
export function createWorkerMarketplaceRegistry(config: WorkerConfig): MarketplaceRegistry {
  return createMarketplaceRegistry({ nodeEnv: config.nodeEnv, devScenarios: config.devMarketplaceScenarios, devLatencyMs: config.devMarketplaceLatencyMs });
}
