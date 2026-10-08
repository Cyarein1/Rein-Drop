import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import {
  idSchema,
  listInventoryQuerySchema,
  recordSaleRequestSchema,
  replacePurchaseCostsRequestSchema,
  updateInventoryItemRequestSchema,
  type InventoryItem,
  type Page,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { OutcomesService } from './outcomes.service.js';

class ListInventoryQueryDto extends createZodDto(listInventoryQuerySchema) {}
class InventoryIdParams extends createZodDto(z.object({ id: idSchema })) {}
class UpdateInventoryItemDto extends createZodDto(updateInventoryItemRequestSchema) {}
class ReplacePurchaseCostsDto extends createZodDto(replacePurchaseCostsRequestSchema) {}
class RecordSaleDto extends createZodDto(recordSaleRequestSchema) {}

/**
 * The current user's inventory and sales. Protected by the global AuthGuard; another user's item
 * is 404. Every write returns the updated item, including its realized result once sold.
 */
@Controller('inventory')
export class OutcomesController {
  constructor(private readonly outcomes: OutcomesService) {}

  /** status: holding (default) | sold | all; newest purchase first. */
  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListInventoryQueryDto): Promise<Page<InventoryItem>> {
    return this.outcomes.list(user.userId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param() params: InventoryIdParams): Promise<InventoryItem> {
    return this.outcomes.get(user.userId, params.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: UpdateInventoryItemDto): Promise<InventoryItem> {
    return this.outcomes.update(user.userId, params.id, body);
  }

  /** Replaces the purchase costs. */
  @Put(':id/purchase-costs')
  replacePurchaseCosts(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: ReplacePurchaseCostsDto): Promise<InventoryItem> {
    return this.outcomes.replacePurchaseCosts(user.userId, params.id, body);
  }

  /** Mark Sold (or correct the sale): price, date, where, selling costs. */
  @Put(':id/sale')
  recordSale(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: RecordSaleDto): Promise<InventoryItem> {
    return this.outcomes.recordSale(user.userId, params.id, body);
  }

  /** Undo the sale: back to In stock. */
  @Delete(':id/sale')
  undoSale(@CurrentUser() user: Principal, @Param() params: InventoryIdParams): Promise<InventoryItem> {
    return this.outcomes.undoSale(user.userId, params.id);
  }
}
