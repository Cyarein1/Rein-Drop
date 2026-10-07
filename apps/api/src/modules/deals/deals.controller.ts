import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  idSchema,
  ignoreDealRequestSchema,
  listDealsQuerySchema,
  markDealBoughtRequestSchema,
  type DealDetail,
  type DealSummary,
  type Page,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { DealsService } from './deals.service.js';

class ListDealsQueryDto extends createZodDto(listDealsQuerySchema) {}
class DealIdParams extends createZodDto(z.object({ id: idSchema })) {}
class IgnoreDealDto extends createZodDto(ignoreDealRequestSchema) {}
class MarkDealBoughtDto extends createZodDto(markDealBoughtRequestSchema) {}

/**
 * The current user's deals. Protected by the global AuthGuard; another user's deal is 404.
 * Actions are idempotent and return the updated DealDetail.
 */
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  /** Ranked feed: strength first, then freshness. Filters: huntId, marketplace, status. */
  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListDealsQueryDto): Promise<Page<DealSummary>> {
    return this.deals.list(user.userId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param() params: DealIdParams): Promise<DealDetail> {
    return this.deals.get(user.userId, params.id);
  }

  /** The user opened the deal (NEW -> SEEN). */
  @Post(':id/seen')
  @HttpCode(HttpStatus.OK)
  seen(@CurrentUser() user: Principal, @Param() params: DealIdParams): Promise<DealDetail> {
    return this.deals.markSeen(user.userId, params.id);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: Principal, @Param() params: DealIdParams): Promise<DealDetail> {
    return this.deals.save(user.userId, params.id);
  }

  @Delete(':id/save')
  unsave(@CurrentUser() user: Principal, @Param() params: DealIdParams): Promise<DealDetail> {
    return this.deals.unsave(user.userId, params.id);
  }

  /** "Not for me", with an optional reason. */
  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  ignore(@CurrentUser() user: Principal, @Param() params: DealIdParams, @Body() body: IgnoreDealDto): Promise<DealDetail> {
    return this.deals.ignore(user.userId, params.id, body);
  }

  @Delete(':id/ignore')
  unignore(@CurrentUser() user: Principal, @Param() params: DealIdParams): Promise<DealDetail> {
    return this.deals.unignore(user.userId, params.id);
  }

  /** Records the purchase (price defaults to the asking price) and marks the deal bought. */
  @Post(':id/bought')
  @HttpCode(HttpStatus.OK)
  bought(@CurrentUser() user: Principal, @Param() params: DealIdParams, @Body() body: MarkDealBoughtDto): Promise<DealDetail> {
    return this.deals.markBought(user.userId, params.id, body);
  }
}
