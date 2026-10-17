import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  addSourcePhotoRequestSchema,
  confirmSellChannelRequestSchema,
  idSchema,
  listSellListingsQuerySchema,
  recordSaleRequestSchema,
  marketplaceKeySchema,
  publishSellListingRequestSchema,
  reorderPhotosRequestSchema,
  SELL_PHOTO_BYTES_MAX,
  sellDraftRequestSchema,
  startSellListingRequestSchema,
  updateSellListingRequestSchema,
  type EventSource,
  type ListingSoldResponse,
  type SellDraftSuggestion,
  type SellListing,
  type SellMarketplacesResponse,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { STRICT_LIMIT } from '../../common/rate-limit/rate-limit.guard.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { Source } from '../outcomes/item-events.js';
import { SellService, type UploadedPhoto } from './sell.service.js';

class ListingIdParams extends createZodDto(z.object({ id: idSchema })) {}
class PhotoParams extends createZodDto(z.object({ id: idSchema, photoId: idSchema })) {}
class ChannelParams extends createZodDto(z.object({ id: idSchema, marketplace: marketplaceKeySchema })) {}
class ListQueryDto extends createZodDto(listSellListingsQuerySchema) {}
class StartDto extends createZodDto(startSellListingRequestSchema) {}
class UpdateDto extends createZodDto(updateSellListingRequestSchema) {}
class DraftDto extends createZodDto(sellDraftRequestSchema) {}
class SourcePhotoDto extends createZodDto(addSourcePhotoRequestSchema) {}
class ReorderDto extends createZodDto(reorderPhotosRequestSchema) {}
class PublishDto extends createZodDto(publishSellListingRequestSchema) {}
class ConfirmDto extends createZodDto(confirmSellChannelRequestSchema) {}
class SoldDto extends createZodDto(recordSaleRequestSchema) {}

/**
 * Sell workspace (decision 0019): the current user's sell listings. Protected by the global
 * AuthGuard; open to every account during beta (no @RequiresProduct('sell') yet - add it when Sell
 * is priced). Every write returns the updated listing.
 */
@Controller('sell')
export class SellController {
  constructor(private readonly sell: SellService) {}

  /** Marketplaces you can list on (and how), plus whether uploads and AI drafts are available. */
  @Get('marketplaces')
  marketplaces(): SellMarketplacesResponse {
    return this.sell.marketplaces();
  }

  /** view: drafts | active | closed | discarded (or an exact status); neither = all but discarded. */
  @Get('listings')
  list(@CurrentUser() user: Principal, @Query() query: ListQueryDto): Promise<{ items: SellListing[] }> {
    return this.sell.list(user.userId, query);
  }

  /** "List" on an inventory item: its listing, created on first use (a discarded one is restored). */
  @Post('listings')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: Principal, @Body() body: StartDto, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.startForItem(user.userId, body.inventoryItemId, source);
  }

  @Get('listings/:id')
  get(@CurrentUser() user: Principal, @Param() params: ListingIdParams): Promise<SellListing> {
    return this.sell.get(user.userId, params.id);
  }

  @Patch('listings/:id')
  update(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: UpdateDto): Promise<SellListing> {
    return this.sell.update(user.userId, params.id, body);
  }

  /** AI suggestion (not saved). Rate-limited: it may call a paid model. */
  @Throttle(STRICT_LIMIT)
  @Post('listings/:id/draft')
  @HttpCode(HttpStatus.OK)
  draft(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: DraftDto): Promise<SellDraftSuggestion> {
    return this.sell.draft(user.userId, params.id, body.notes);
  }

  /** Multipart upload, field "photo" (JPEG / PNG / WebP / HEIC, up to 8 MB). */
  @Post('listings/:id/photos')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: SELL_PHOTO_BYTES_MAX, files: 1 } }))
  addPhoto(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @UploadedFile() file: UploadedPhoto | undefined): Promise<SellListing> {
    return this.sell.addOwnPhoto(user.userId, params.id, file);
  }

  @Post('listings/:id/photos/source')
  addSourcePhoto(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: SourcePhotoDto): Promise<SellListing> {
    return this.sell.addSourcePhoto(user.userId, params.id, body.url);
  }

  /** Every photo id in the new order; the first is the cover. */
  @Put('listings/:id/photos/order')
  reorder(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: ReorderDto): Promise<SellListing> {
    return this.sell.reorderPhotos(user.userId, params.id, body.photoIds);
  }

  @Delete('listings/:id/photos/:photoId')
  removePhoto(@CurrentUser() user: Principal, @Param() params: PhotoParams): Promise<SellListing> {
    return this.sell.removePhoto(user.userId, params.id, params.photoId);
  }

  @Post('listings/:id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: PublishDto, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.publish(user.userId, params.id, body.marketplaces, source);
  }

  @Post('listings/:id/channels/:marketplace/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: Principal, @Param() params: ChannelParams, @Body() body: ConfirmDto, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.confirmPosted(user.userId, params.id, params.marketplace, body.url, source);
  }

  /** Take it down there; on a channel already ended by Rein Drop, confirms you removed it (clears removalPending). */
  @Post('listings/:id/channels/:marketplace/end')
  @HttpCode(HttpStatus.OK)
  end(@CurrentUser() user: Principal, @Param() params: ChannelParams, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.endChannel(user.userId, params.id, params.marketplace, source);
  }

  /** "Sold on eBay for $X": records the sale (like PUT /inventory/:id/sale) and ends every other live listing. */
  @Post('listings/:id/sold')
  @HttpCode(HttpStatus.OK)
  sold(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Body() body: SoldDto, @Source() source: EventSource | null): Promise<ListingSoldResponse> {
    return this.sell.markSold(user.userId, params.id, body, source);
  }

  /** Throw away a draft that isn't live anywhere (hidden, restorable - never deleted). */
  @Post('listings/:id/discard')
  @HttpCode(HttpStatus.OK)
  discard(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.discard(user.userId, params.id, source);
  }

  @Post('listings/:id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: Principal, @Param() params: ListingIdParams, @Source() source: EventSource | null): Promise<SellListing> {
    return this.sell.restore(user.userId, params.id, source);
  }
}
