import { Module } from '@nestjs/common';
import { DevDiagnosticsController } from './diagnostics.controller.js';
import { DiagnosticsService } from './diagnostics.service.js';

/**
 * Diagnostics - INTERNAL development reporting on ingestion economics and freshness (decision 0011).
 *
 * Owns: (no tables). Reads SearchRun, Listing / RawListing, HuntMatch, DealAnalysis and Alert with
 * PostgreSQL aggregates (diagnostics.sql.ts), across every user - so it is not customer analytics.
 * Endpoints: GET /dev/diagnostics/ingestion?hours= | ?since=&until= (development only, 404 in production).
 */
@Module({
  controllers: [DevDiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
