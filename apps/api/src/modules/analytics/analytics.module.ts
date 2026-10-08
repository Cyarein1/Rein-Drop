import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * Analytics - Read-only period reporting over outcomes and activity (decision 0008).
 *
 * Owns: (no tables). Reads InventoryItem / Sale / Cost, HuntMatch / SavedDeal, Alert and
 * DealAnalysis with PostgreSQL aggregates (analytics.sql.ts) - no warehouse, no copies.
 * Endpoints: GET /analytics/{overview,hunts,products,marketplaces,missed}?period=.
 * Product analytics vendor (PostHog candidate, D15) is separate and TBD.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
