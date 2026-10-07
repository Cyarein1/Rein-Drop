import { Module } from '@nestjs/common';

/**
 * Matching - Decides which listings match which hunts and tracks match status.
 *
 * Owns: HuntMatch
 * TODO(product): matching rules.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class MatchingModule {}
