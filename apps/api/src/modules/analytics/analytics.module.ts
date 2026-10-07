import { Module } from '@nestjs/common';

/**
 * Analytics - Read-only reporting over outcomes and activity (profit, sell-through, ...).
 *
 * Owns: (no tables)
 * Owns no tables; reads other modules' data. TODO(product): metrics to report. Product analytics vendor (PostHog candidate) is separate and TBD.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class AnalyticsModule {}
