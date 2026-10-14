import { UsersModule } from './users/users.module.js';
import { GeoModule } from './geo/geo.module.js';
import { SellerProfileModule } from './seller-profile/seller-profile.module.js';
import { HuntsModule } from './hunts/hunts.module.js';
import { MarketplacesModule } from './marketplaces/marketplaces.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { MatchingModule } from './matching/matching.module.js';
import { DealIntelligenceModule } from './deal-intelligence/deal-intelligence.module.js';
import { DealsModule } from './deals/deals.module.js';
import { OutcomesModule } from './outcomes/outcomes.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { PlansModule } from './plans/plans.module.js';
import { BillingModule } from './billing/billing.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { UsageModule } from './usage/usage.module.js';
import { EntitlementsModule } from './entitlements/entitlements.module.js';
import { HomeModule } from './home/home.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { WaitlistModule } from './waitlist/waitlist.module.js';

/** Domain modules, one per Rein Drop bounded context. Imported by AppModule. */
export const DOMAIN_MODULES = [
  // Cross-cutting (global, no tables): product events recorded by the modules below.
  TelemetryModule,
  UsersModule,
  // Places, "Your area" and map tiles (global: Hunts place locations on save).
  GeoModule,
  SellerProfileModule,
  HuntsModule,
  MarketplacesModule,
  ListingsModule,
  MatchingModule,
  DealIntelligenceModule,
  DealsModule,
  OutcomesModule,
  AnalyticsModule,
  PlansModule,
  BillingModule,
  NotificationsModule,
  UsageModule,
  // Composition (no tables): plan + usage read endpoints; Home.
  EntitlementsModule,
  HomeModule,
  // Development-only internal reporting (no tables).
  DiagnosticsModule,
  // Public marketing: early-access sign-ups (write-only).
  WaitlistModule,
];
