import { UsersModule } from './users/users.module.js';
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

/** Domain modules, one per Rein Drop bounded context. Imported by AppModule. */
export const DOMAIN_MODULES = [
  UsersModule,
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
];
