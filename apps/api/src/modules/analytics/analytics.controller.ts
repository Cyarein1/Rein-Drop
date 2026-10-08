import { Controller, Get, Query } from '@nestjs/common';
import {
  analyticsQuerySchema,
  type AnalyticsOverview,
  type HuntAnalytics,
  type MarketplaceAnalytics,
  type MissedPotential,
  type ProductAnalytics,
} from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { AnalyticsService } from './analytics.service.js';

class AnalyticsQueryDto extends createZodDto(analyticsQuerySchema) {}

/** The current user's analytics for a rolling period (?period=7d|30d|90d|365d|all, default 30d). */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Spend, revenue, realized profit / margin, buys, sells, and what's held now. */
  @Get('overview')
  overview(@CurrentUser() user: Principal, @Query() query: AnalyticsQueryDto): Promise<AnalyticsOverview> {
    return this.analytics.overview(user.userId, query.period);
  }

  /** Per-Hunt funnel: found -> alerted -> viewed -> saved / ignored -> bought -> sold. */
  @Get('hunts')
  hunts(@CurrentUser() user: Principal, @Query() query: AnalyticsQueryDto): Promise<HuntAnalytics> {
    return this.analytics.hunts(user.userId, query.period);
  }

  @Get('products')
  products(@CurrentUser() user: Principal, @Query() query: AnalyticsQueryDto): Promise<ProductAnalytics> {
    return this.analytics.products(user.userId, query.period);
  }

  @Get('marketplaces')
  marketplaces(@CurrentUser() user: Principal, @Query() query: AnalyticsQueryDto): Promise<MarketplaceAnalytics> {
    return this.analytics.marketplaces(user.userId, query.period);
  }

  /** Missed potential: strong deals never bought. Estimates only - never profit or loss. */
  @Get('missed')
  missed(@CurrentUser() user: Principal, @Query() query: AnalyticsQueryDto): Promise<MissedPotential> {
    return this.analytics.missed(user.userId, query.period);
  }
}
