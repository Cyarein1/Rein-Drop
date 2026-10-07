import { Module } from '@nestjs/common';

/**
 * Plans - Plans and entitlements: what each plan grants, and entitlement checks.
 *
 * Owns: Plan, Entitlement
 * TODO(product): entitlement keys and limits.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class PlansModule {}
