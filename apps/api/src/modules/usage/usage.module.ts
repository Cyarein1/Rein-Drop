import { Module } from '@nestjs/common';

/**
 * Usage - Records metered usage events, checked against plan entitlements.
 *
 * Owns: UsageEvent
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class UsageModule {}
