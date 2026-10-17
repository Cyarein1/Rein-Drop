import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  cancelItemRequestSchema,
  createInventoryItemRequestSchema,
  idSchema,
  listInventoryQuerySchema,
  recordSaleRequestSchema,
  replacePurchaseCostsRequestSchema,
  returnItemRequestSchema,
  updateInventoryItemRequestSchema,
  writeOffItemRequestSchema,
  type EventSource,
  type InventoryCounts,
  type InventoryEventList,
  type InventoryItem,
  type Page,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { Source } from './item-events.js';
import { OutcomesService } from './outcomes.service.js';

class ListInventoryQueryDto extends createZodDto(listInventoryQuerySchema) {}
class InventoryIdParams extends createZodDto(z.object({ id: idSchema })) {}
class CreateInventoryItemDto extends createZodDto(createInventoryItemRequestSchema) {}
class UpdateInventoryItemDto extends createZodDto(updateInventoryItemRequestSchema) {}
class ReplacePurchaseCostsDto extends createZodDto(replacePurchaseCostsRequestSchema) {}
class RecordSaleDto extends createZodDto(recordSaleRequestSchema) {}
class ReturnItemDto extends createZodDto(returnItemRequestSchema) {}
class WriteOffItemDto extends createZodDto(writeOffItemRequestSchema) {}
class CancelItemDto extends createZodDto(cancelItemRequestSchema) {}

/**
 * The current user's inventory and sales. Protected by the global AuthGuard; another user's item
 * is 404. Every write returns the updated item, including its realized result once sold / closed,
 * the actions allowed next (lifecycle state machine) and writes an item event (audit trail). Nothing
 * is deleted (decision 0021): mistakes and endings are statuses. A refused move is 409 CONFLICT.
 */
@Controller('inventory')
export class OutcomesController {
  constructor(private readonly outcomes: OutcomesService) {}

  /** Chip counts per Sell-area section and listing tab (one call). Declared before :id. */
  @Get('counts')
  counts(@CurrentUser() user: Principal): Promise<InventoryCounts> {
    return this.outcomes.counts(user.userId);
  }

  /** section: holding | listed | sold | other (else status: holding (default) | sold | closed | all); newest purchase first. */
  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListInventoryQueryDto): Promise<Page<InventoryItem>> {
    return this.outcomes.list(user.userId, query);
  }

  /** "Add item": something bought outside Rein Drop. 201 with the new item. */
  @Post()
  create(@CurrentUser() user: Principal, @Body() body: CreateInventoryItemDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.create(user.userId, body, source);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param() params: InventoryIdParams): Promise<InventoryItem> {
    return this.outcomes.get(user.userId, params.id);
  }

  /** The item's timeline (audit trail), oldest first. */
  @Get(':id/events')
  events(@CurrentUser() user: Principal, @Param() params: InventoryIdParams): Promise<InventoryEventList> {
    return this.outcomes.timeline(user.userId, params.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: UpdateInventoryItemDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.update(user.userId, params.id, body, source);
  }

  /** Replaces the purchase costs. */
  @Put(':id/purchase-costs')
  replacePurchaseCosts(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: ReplacePurchaseCostsDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.replacePurchaseCosts(user.userId, params.id, body, source);
  }

  /** Mark Sold (or correct the sale): price, date, where, selling costs. Ends live marketplace listings. */
  @Put(':id/sale')
  recordSale(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: RecordSaleDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.recordSale(user.userId, params.id, body, source);
  }

  /** Undo the sale: back to In stock. Its marketplace listings stay ended (republish from Sell). */
  @Delete(':id/sale')
  undoSale(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.undoSale(user.userId, params.id, source);
  }

  /** Returned to the seller / refunded (refund defaults to the purchase price). */
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  returnItem(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: ReturnItemDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.returnItem(user.userId, params.id, body, source);
  }

  /** Lost, broken or unsellable: the cost becomes a realized loss. */
  @Post(':id/write-off')
  @HttpCode(HttpStatus.OK)
  writeOff(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: WriteOffItemDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.writeOff(user.userId, params.id, body, source);
  }

  /** Bought by mistake / Undo bought (nothing live on a marketplace; re-opens the deal). */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Body() body: CancelItemDto, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.cancel(user.userId, params.id, body, source);
  }

  /** Back to In stock from Returned / Written off / Cancelled. */
  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@CurrentUser() user: Principal, @Param() params: InventoryIdParams, @Source() source: EventSource | null): Promise<InventoryItem> {
    return this.outcomes.reopen(user.userId, params.id, source);
  }
}
