import { Module } from '@nestjs/common';

/**
 * Hunts - Saved sourcing searches and which marketplaces each searches.
 *
 * Owns: Hunt, HuntMarketplace
 * TODO(product): typed hunt criteria (defined in @rein-drop/contracts).
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class HuntsModule {}
