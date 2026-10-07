import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service.js';

/**
 * Matching - Decides which listings match which hunts and tracks match status.
 *
 * Owns: HuntMatch
 * The matching rules live in @rein-drop/matching and run in the worker. This module owns the
 * user's decisions on a match (seen, ignore, bought) through MatchingService.
 */
@Module({
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
