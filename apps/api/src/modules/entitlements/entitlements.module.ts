import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { HuntsModule } from '../hunts/hunts.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { EntitlementsController } from './entitlements.controller.js';

/**
 * Entitlements - read-side composition of the user's plan (Plans) and usage (Hunts).
 *
 * Owns: no tables. Exists so Plans does not depend on Hunts (Hunts already depends on
 * Plans for enforcement at activation).
 * Endpoints: GET /me/entitlements.
 */
@Module({
  imports: [PlansModule, HuntsModule, BillingModule],
  controllers: [EntitlementsController],
})
export class EntitlementsModule {}
