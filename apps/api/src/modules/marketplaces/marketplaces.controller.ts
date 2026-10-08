import { Controller, Get, Inject } from '@nestjs/common';
import type { SourceHealthList } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';
import { loadSourceHealth } from './source-health.js';

/** Marketplace sources as users see them. Protected like every other route (it's account UI data). */
@Controller('marketplaces')
export class MarketplacesController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Every launch marketplace's health: healthy / degraded / down / not configured / unknown. */
  @Get('health')
  async health(): Promise<SourceHealthList> {
    const now = new Date();
    return { items: await loadSourceHealth(this.prisma, now), generatedAt: now.toISOString() };
  }
}
