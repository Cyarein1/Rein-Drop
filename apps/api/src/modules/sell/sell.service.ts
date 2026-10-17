import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AIProviderError, type AIProvider, type ListingDraftFacts } from '@rein-drop/ai-core';
import {
  CHANNEL_END_REASONS,
  expectedSnapshotSchema,
  isHoldingStatus,
  itemSpecificSchema,
  SELL_PHOTO_BYTES_MAX,
  SELL_PHOTO_TYPES,
  SELL_PHOTOS_MAX,
  type ChannelEndReason,
  type EventSource,
  type ListingCondition,
  type ListingSoldResponse,
  type ListSellListingsQuery,
  type MarketplaceKey,
  type RecordSaleRequest,
  type SellChannel,
  type SellDraftSuggestion,
  type SellListing,
  type SellListingStatus,
  type SellMarketplace,
  type UpdateSellListingRequest,
} from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { z } from 'zod';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { writeItemEvent } from '../outcomes/item-events.js';
import { isActiveChannel } from '../outcomes/ledger.js';
import { OutcomesService, type ChannelsClosed, type ItemExit } from '../outcomes/outcomes.service.js';
import { MEDIA_STORAGE, signedMediaPath, type MediaStorage } from './media-storage.js';
import { assistedText, FACEBOOK_CREATE_URL, LISTING_PUBLISHERS, type ListingPublisher } from './publishers.js';

export const SELL_AI = Symbol('SELL_AI');

const CONDITION_TO_DB = { new: 'NEW', like_new: 'LIKE_NEW', good: 'GOOD', fair: 'FAIR', for_parts: 'FOR_PARTS' } as const;
const CONDITION_FROM_DB = Object.fromEntries(Object.entries(CONDITION_TO_DB).map(([k, v]) => [v, k])) as Record<string, ListingCondition>;

const LISTING_INCLUDE = {
  photos: { orderBy: { position: 'asc' } },
  channels: { orderBy: { createdAt: 'asc' } },
  inventoryItem: {
    include: {
      listing: { select: { title: true, description: true, conditionText: true, imageUrls: true, marketplace: { select: { key: true } } } },
      sale: { select: { salePriceMinor: true, currency: true, soldAt: true, marketplace: { select: { key: true } } } },
    },
  },
} satisfies Prisma.SellListingInclude;
type ListingRow = Prisma.SellListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

/** Sell tabs -> listing statuses. No view and no status = everything but discarded drafts. */
const VIEW_STATUS = { drafts: 'DRAFT', active: 'PUBLISHED', closed: 'ENDED', discarded: 'DISCARDED' } as const;

const NO_CHANNELS: ChannelsClosed = { ended: [], removeManually: [] };
const endReason = (value: string | null): ChannelEndReason | null =>
  (CHANNEL_END_REASONS as readonly string[]).includes(value ?? '') ? (value as ChannelEndReason) : null;

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Sell workspace (decision 0019): one sell listing per inventory item - written by hand or from an
 * AI draft the seller edits - with photos (own uploads and/or the source listing's) and channels
 * (one per marketplace). Another user's item or listing is 404.
 *
 * Decision 0021: nothing is deleted - a draft is discarded (restorable), and a sale (from here or
 * from Inventory), a return or a write-off ends every live channel in the same transaction (the
 * exit listener registered with Outcomes), so an item can't be sold twice. Assisted channels
 * (Facebook) can't be taken down by Rein Drop: they are marked ended with `removalPending`.
 * Every change writes an item event.
 */
@Injectable()
export class SellService implements OnModuleInit {
  private readonly logger = new Logger(SellService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(LISTING_PUBLISHERS) private readonly publishers: Map<MarketplaceKey, ListingPublisher>,
    @Inject(SELL_AI) private readonly ai: AIProvider | null,
    private readonly outcomes: OutcomesService,
  ) {}

  onModuleInit(): void {
    this.outcomes.onItemExit((tx, exit) => this.closeForItem(tx, exit));
  }

  marketplaces(): { items: SellMarketplace[]; uploads: boolean; ai: boolean } {
    return { items: [...this.publishers.values()].map((p) => p.info), uploads: this.media.enabled, ai: this.ai !== null };
  }

  /**
   * "List" on an inventory item: its sell listing, created on first use (title and currency from the
   * item). A discarded listing is restored. Only for an item you're still holding.
   */
  async startForItem(userId: string, inventoryItemId: string, source: EventSource | null = null): Promise<SellListing> {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, select: { id: true, title: true, currency: true, status: true } });
    if (!item) throw new AppException('NOT_FOUND', 'Inventory item not found', HttpStatus.NOT_FOUND);
    const existing = await this.prisma.sellListing.findUnique({ where: { inventoryItemId }, include: LISTING_INCLUDE });
    if (existing && existing.status !== 'DISCARDED') return this.toDto(existing);
    if (!isHoldingStatus(item.status)) throw notHeld(item.status);
    if (existing) return this.restore(userId, existing.id, source);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sellListing.create({ data: { userId, inventoryItemId, title: item.title.slice(0, 80), currency: item.currency }, select: { id: true } });
      await writeItemEvent(tx, { itemId: inventoryItemId, userId, type: 'LISTING_STARTED', source, details: { listingId: created.id } });
      return created.id;
    });
    return this.get(userId, id);
  }

  async list(userId: string, query: ListSellListingsQuery = {}): Promise<{ items: SellListing[] }> {
    const status = query.status ?? (query.view ? VIEW_STATUS[query.view] : undefined);
    const rows = await this.prisma.sellListing.findMany({
      where: { userId, status: status ?? { not: 'DISCARDED' } },
      include: LISTING_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return { items: rows.map((r) => this.toDto(r)) };
  }

  async get(userId: string, id: string): Promise<SellListing> {
    return this.toDto(await this.owned(userId, id));
  }

  async update(userId: string, id: string, body: UpdateSellListingRequest): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (row.status === 'DISCARDED') throw discarded();
    if (body.price && row.currency && body.price.currency !== row.currency) {
      throw new ValidationFailedException([{ path: 'price.currency', message: `Use ${row.currency}, like the item` }]);
    }
    const updated = await this.prisma.sellListing.update({
      where: { id: row.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.price !== undefined ? { priceMinor: body.price?.amountMinor ?? null, ...(body.price ? { currency: body.price.currency } : {}) } : {}),
        ...(body.condition !== undefined ? { condition: body.condition ? CONDITION_TO_DB[body.condition] : null } : {}),
        ...(body.itemSpecifics !== undefined ? { itemSpecifics: body.itemSpecifics } : {}),
        ...(body.aiAssisted !== undefined ? { aiAssisted: body.aiAssisted } : {}),
      },
      include: LISTING_INCLUDE,
    });
    return this.toDto(updated);
  }

  /** Throw away a draft (nothing live): hidden from the normal lists, restorable. Idempotent. */
  async discard(userId: string, id: string, source: EventSource | null = null): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (row.status === 'DISCARDED') return this.toDto(row);
    if (row.status !== 'DRAFT' || row.channels.some(isActiveChannel)) {
      throw new AppException('CONFLICT', "Only a draft that isn't live anywhere can be discarded - end the listing instead", HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sellListing.update({ where: { id: row.id }, data: { status: 'DISCARDED' } });
      await writeItemEvent(tx, { itemId: row.inventoryItemId, userId, type: 'LISTING_DISCARDED', source, details: { listingId: row.id } });
    });
    return this.get(userId, id);
  }

  /** Bring a discarded listing back (only while the item is still held). Idempotent. */
  async restore(userId: string, id: string, source: EventSource | null = null): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (row.status !== 'DISCARDED') return this.toDto(row);
    if (!isHoldingStatus(row.inventoryItem.status)) throw notHeld(row.inventoryItem.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.sellListing.update({ where: { id: row.id }, data: { status: row.channels.some((c) => c.status === 'ENDED') ? 'ENDED' : 'DRAFT' } });
      await writeItemEvent(tx, { itemId: row.inventoryItemId, userId, type: 'LISTING_RESTORED', source, details: { listingId: row.id } });
    });
    return this.get(userId, id);
  }

  /**
   * "Sold on eBay for $X": records the sale exactly like PUT /inventory/:id/sale (Outcomes), which
   * ends every other live channel and this listing in the same transaction.
   */
  async markSold(userId: string, id: string, request: RecordSaleRequest, source: EventSource | null = null): Promise<ListingSoldResponse> {
    const row = await this.owned(userId, id);
    if (row.status === 'DISCARDED') throw new AppException('CONFLICT', 'This listing was discarded - restore it first, or mark the item sold in Inventory', HttpStatus.CONFLICT);
    if (request.marketplace && !row.channels.some((c) => c.marketplace === request.marketplace)) {
      throw new ValidationFailedException([{ path: 'body.marketplace', message: "It isn't listed there - choose one of its marketplaces, or somewhere else" }]);
    }
    const { item, channels } = await this.outcomes.recordSaleWithChannels(userId, row.inventoryItemId, request, { source, via: 'listing', newOnly: true });
    return { listing: await this.get(userId, id), item, removeManually: channels.removeManually };
  }

  /** An AI suggestion from the item's facts - NOT saved: the seller edits it, then saves. */
  async draft(userId: string, id: string, notes?: string): Promise<SellDraftSuggestion> {
    if (!this.ai) throw new AppException('SERVICE_UNAVAILABLE', "AI drafts aren't set up here yet. You can write the listing yourself.", HttpStatus.SERVICE_UNAVAILABLE);
    const row = await this.owned(userId, id);
    const item = row.inventoryItem;
    const expected = expectedSnapshotSchema.safeParse(item.expected);
    const resale = expected.success ? expected.data.estimatedResale : null;
    const source = item.listing;
    const facts: ListingDraftFacts = {
      itemTitle: item.title,
      sourceTitle: source?.title ?? null,
      sourceDescription: source?.description ?? null,
      sourceConditionText: source?.conditionText ?? null,
      sourceMarketplace: source?.marketplace.key === 'ebay' || source?.marketplace.key === 'facebook' ? source.marketplace.key : null,
      purchasePrice: { amountMinor: item.purchasePriceMinor, currency: item.currency },
      // Only the TYPICAL estimate is frozen at purchase, so a suggested price can only be that value.
      resaleEstimate: resale ? { low: resale, typical: resale, high: resale, sampleSize: 1 } : null,
      sellerNotes: [notes, item.notes].filter(Boolean).join('\n') || null,
      photoCount: row.photos.length,
      localeTag: 'en',
    };
    try {
      const { output, meta } = await this.ai.draftListing(facts);
      return { ...output, itemSpecifics: output.itemSpecifics.map((s) => itemSpecificSchema.parse({ name: s.name, value: s.value.slice(0, 80) })), provider: meta.provider };
    } catch (err) {
      if (!(err instanceof AIProviderError)) throw err;
      this.logger.warn(`AI draft failed (${err.code}): ${err.message}`);
      throw new AppException('SERVICE_UNAVAILABLE', "The AI couldn't write a usable draft right now. Try again, or write it yourself.", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async addOwnPhoto(userId: string, id: string, file: UploadedPhoto | undefined): Promise<SellListing> {
    if (!this.media.enabled) throw new AppException('SERVICE_UNAVAILABLE', "Photo uploads aren't available here yet. You can use the original listing's photos.", HttpStatus.SERVICE_UNAVAILABLE);
    if (!file) throw new ValidationFailedException([{ path: 'photo', message: 'Choose a photo' }]);
    if (!(SELL_PHOTO_TYPES as readonly string[]).includes(file.mimetype)) throw new ValidationFailedException([{ path: 'photo', message: 'Use a JPEG, PNG, WebP or HEIC photo' }]);
    if (file.size > SELL_PHOTO_BYTES_MAX) throw new ValidationFailedException([{ path: 'photo', message: 'Photos can be up to 8 MB' }]);
    const row = await this.owned(userId, id);
    this.assertRoom(row);
    const key = await this.media.put(file.buffer, file.mimetype);
    await this.prisma.sellPhoto.create({ data: { sellListingId: row.id, source: 'OWN', ref: key, contentType: file.mimetype, position: row.photos.length } });
    return this.get(userId, id);
  }

  /** Adds one of the source listing's photos (only those - never an arbitrary URL). */
  async addSourcePhoto(userId: string, id: string, url: string): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (!(row.inventoryItem.listing?.imageUrls ?? []).includes(url)) {
      throw new ValidationFailedException([{ path: 'url', message: "That isn't a photo from the original listing" }]);
    }
    if (row.photos.some((p) => p.source === 'SOURCE' && p.ref === url)) return this.toDto(row);
    this.assertRoom(row);
    await this.prisma.sellPhoto.create({ data: { sellListingId: row.id, source: 'SOURCE', ref: url, position: row.photos.length } });
    return this.get(userId, id);
  }

  async removePhoto(userId: string, id: string, photoId: string): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const photo = row.photos.find((p) => p.id === photoId);
    if (!photo) throw new AppException('NOT_FOUND', 'Photo not found', HttpStatus.NOT_FOUND);
    const rest = row.photos.filter((p) => p.id !== photoId);
    await this.prisma.$transaction([
      this.prisma.sellPhoto.delete({ where: { id: photoId } }),
      ...rest.map((p, position) => this.prisma.sellPhoto.update({ where: { id: p.id }, data: { position } })),
    ]);
    if (photo.source === 'OWN') await this.media.delete(photo.ref).catch(() => undefined);
    return this.get(userId, id);
  }

  /** New order of every photo; the first is the cover. */
  async reorderPhotos(userId: string, id: string, photoIds: string[]): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const current = new Set(row.photos.map((p) => p.id));
    if (photoIds.length !== current.size || new Set(photoIds).size !== photoIds.length || photoIds.some((p) => !current.has(p))) {
      throw new ValidationFailedException([{ path: 'photoIds', message: "List every photo of this listing exactly once" }]);
    }
    await this.prisma.$transaction(photoIds.map((photoId, position) => this.prisma.sellPhoto.update({ where: { id: photoId }, data: { position } })));
    return this.get(userId, id);
  }

  /** Cross-list: publish to each chosen marketplace (any supported marketplace during beta). */
  async publish(userId: string, id: string, marketplaces: MarketplaceKey[], source: EventSource | null = null): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (row.status === 'DISCARDED') throw discarded();
    if (!isHoldingStatus(row.inventoryItem.status)) throw notHeld(row.inventoryItem.status);
    const missing = this.missing(row);
    if (missing.length > 0) throw new ValidationFailedException(missing.map((message) => ({ path: 'listing', message })));
    const input = { listingId: row.id, title: row.title, description: row.description, price: { amountMinor: row.priceMinor!, currency: row.currency! }, condition: CONDITION_FROM_DB[row.condition!]!, photoCount: row.photos.length };

    for (const marketplace of [...new Set(marketplaces)]) {
      const publisher = this.publishers.get(marketplace);
      if (!publisher) throw new ValidationFailedException([{ path: 'marketplaces', message: `Listing on ${marketplace} isn't supported yet` }]);
      const live = row.channels.find((c) => c.marketplace === marketplace && isActiveChannel(c));
      if (live) continue;
      const outcome = await publisher.publish(input).catch((err: unknown): Awaited<ReturnType<ListingPublisher['publish']>> => ({
        status: 'FAILED',
        provider: publisher.info.mode,
        error: err instanceof Error ? err.message : String(err),
      }));
      const data = {
        status: outcome.status,
        provider: outcome.provider,
        externalId: outcome.status === 'PUBLISHED' ? outcome.externalId : null,
        url: outcome.status === 'PUBLISHED' ? outcome.url : null,
        error: outcome.status === 'FAILED' ? outcome.error : null,
        publishedAt: outcome.status === 'PUBLISHED' ? new Date() : null,
        // Republishing after it ended starts afresh.
        endedAt: null,
        endedReason: null,
        removalPending: false,
      };
      await this.prisma.$transaction(async (tx) => {
        await tx.sellChannel.upsert({ where: { sellListingId_marketplace: { sellListingId: row.id, marketplace } }, create: { sellListingId: row.id, marketplace, ...data }, update: data });
        if (outcome.status === 'PUBLISHED') {
          await writeItemEvent(tx, { itemId: row.inventoryItemId, userId, type: 'PUBLISHED', source, details: { listingId: row.id, marketplace, simulated: outcome.provider === 'mock' } });
        }
      });
    }
    await this.syncStatus(row.id);
    return this.get(userId, id);
  }

  /** Assisted marketplaces: the seller posted it themselves (optionally with its link). */
  async confirmPosted(userId: string, id: string, marketplace: MarketplaceKey, url?: string, source: EventSource | null = null): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const channel = row.channels.find((c) => c.marketplace === marketplace);
    if (!channel || channel.status !== 'AWAITING_CONFIRMATION') throw new AppException('CONFLICT', 'Nothing is waiting to be confirmed on that marketplace', HttpStatus.CONFLICT);
    if (!isHoldingStatus(row.inventoryItem.status)) throw notHeld(row.inventoryItem.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.sellChannel.update({ where: { id: channel.id }, data: { status: 'PUBLISHED', url: url ?? null, publishedAt: new Date() } });
      await writeItemEvent(tx, { itemId: row.inventoryItemId, userId, type: 'PUBLISHED', source, details: { listingId: row.id, marketplace, simulated: false } });
    });
    await this.syncStatus(row.id);
    return this.get(userId, id);
  }

  /**
   * Take it down on one marketplace (mock / assisted: recorded here; the seller removes it on
   * Facebook). On a channel Rein Drop already ended, it confirms the seller removed it there
   * (clears `removalPending`). Idempotent.
   */
  async endChannel(userId: string, id: string, marketplace: MarketplaceKey, source: EventSource | null = null): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const channel = row.channels.find((c) => c.marketplace === marketplace);
    if (!channel) throw new AppException('NOT_FOUND', 'Not listed on that marketplace', HttpStatus.NOT_FOUND);
    if (channel.status === 'ENDED') {
      if (channel.removalPending) await this.prisma.sellChannel.update({ where: { id: channel.id }, data: { removalPending: false } });
      return this.get(userId, id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sellChannel.update({ where: { id: channel.id }, data: { status: 'ENDED', endedAt: new Date(), endedReason: 'user', removalPending: false } });
      await writeItemEvent(tx, { itemId: row.inventoryItemId, userId, type: 'CHANNEL_ENDED', source, details: { listingId: row.id, marketplace, reason: 'user' } });
    });
    await this.syncStatus(row.id);
    return this.get(userId, id);
  }

  /**
   * The item stopped being held (sold / returned / written off / cancelled) - runs inside that
   * transaction. Ends every live channel through its publisher; assisted ones are marked for the
   * seller to remove (except where it sold). The listing ends; a cancelled item's draft is discarded.
   */
  private async closeForItem(tx: Prisma.TransactionClient, exit: ItemExit): Promise<ChannelsClosed> {
    const listing = await tx.sellListing.findUnique({ where: { inventoryItemId: exit.itemId }, include: { channels: { orderBy: { createdAt: 'asc' } } } });
    if (!listing) return NO_CHANNELS;
    if (exit.reason === 'cancelled') {
      if (listing.status === 'DRAFT') {
        await tx.sellListing.update({ where: { id: listing.id }, data: { status: 'DISCARDED' } });
        await writeItemEvent(tx, { itemId: exit.itemId, userId: exit.userId, type: 'LISTING_DISCARDED', source: exit.source, details: { listingId: listing.id } });
      }
      return NO_CHANNELS;
    }
    const result: ChannelsClosed = { ended: [], removeManually: [] };
    const now = new Date();
    for (const channel of listing.channels.filter(isActiveChannel)) {
      const marketplace = channel.marketplace as MarketplaceKey;
      const soldHere = exit.reason === 'sold' && exit.soldOn === marketplace;
      const publisher = this.publishers.get(marketplace);
      let outcome: 'ended' | 'manual' = 'manual';
      try {
        if (publisher) outcome = await publisher.end({ listingId: listing.id, externalId: channel.externalId });
      } catch (err) {
        // Never leave it live here: record it ended and ask the seller to check the marketplace.
        this.logger.warn(`Ending the ${marketplace} listing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const removalPending = outcome === 'manual' && !soldHere;
      const reason: ChannelEndReason = exit.reason === 'sold' ? (soldHere ? 'sold_here' : 'sold_elsewhere') : exit.reason;
      await tx.sellChannel.update({ where: { id: channel.id }, data: { status: 'ENDED', endedAt: now, endedReason: reason, removalPending } });
      await writeItemEvent(tx, {
        itemId: exit.itemId,
        userId: exit.userId,
        type: 'CHANNEL_ENDED',
        source: exit.source,
        details: { listingId: listing.id, marketplace, reason, ...(removalPending ? { removeManually: [marketplace] } : {}) },
      });
      result.ended.push(marketplace);
      if (removalPending) result.removeManually.push(marketplace);
    }
    if (listing.status === 'DRAFT' || listing.status === 'PUBLISHED') await tx.sellListing.update({ where: { id: listing.id }, data: { status: 'ENDED' } });
    return result;
  }

  private assertRoom(row: ListingRow) {
    if (row.photos.length >= SELL_PHOTOS_MAX) throw new ValidationFailedException([{ path: 'photo', message: `Up to ${SELL_PHOTOS_MAX} photos` }]);
  }

  private async owned(userId: string, id: string): Promise<ListingRow> {
    const row = await this.prisma.sellListing.findFirst({ where: { id, userId }, include: LISTING_INCLUDE });
    if (!row) throw new AppException('NOT_FOUND', 'Listing not found', HttpStatus.NOT_FOUND);
    return row;
  }

  /** Listing status from its channels; a live listing marks the inventory item Listed (never back from Sold). */
  private async syncStatus(listingId: string): Promise<void> {
    const row = await this.prisma.sellListing.findUniqueOrThrow({ where: { id: listingId }, include: { channels: true, inventoryItem: { select: { id: true, status: true } } } });
    if (row.status === 'DISCARDED') return;
    const active = row.channels.some(isActiveChannel);
    // An item no longer held (sold / returned / written off / cancelled) keeps an ended listing.
    const status: SellListingStatus = !isHoldingStatus(row.inventoryItem.status)
      ? 'ENDED'
      : active
        ? 'PUBLISHED'
        : row.channels.some((c) => c.status === 'ENDED')
          ? 'ENDED'
          : 'DRAFT';
    await this.prisma.sellListing.update({ where: { id: listingId }, data: { status } });
    const posted = row.channels.some((c) => c.status === 'PUBLISHED');
    if (posted && row.inventoryItem.status === 'IN_STOCK') await this.prisma.inventoryItem.update({ where: { id: row.inventoryItem.id }, data: { status: 'LISTED' } });
    if (!active && row.inventoryItem.status === 'LISTED') await this.prisma.inventoryItem.update({ where: { id: row.inventoryItem.id }, data: { status: 'IN_STOCK' } });
  }

  private missing(row: Pick<ListingRow, 'title' | 'description' | 'priceMinor' | 'condition' | 'photos'>): string[] {
    return [
      !row.title.trim() && 'Add a title',
      !row.description.trim() && 'Write a description',
      row.priceMinor === null && 'Set your price',
      row.condition === null && 'Choose the condition',
      row.photos.length === 0 && 'Add at least one photo',
    ].filter((m): m is string => Boolean(m));
  }

  private toDto(row: ListingRow): SellListing {
    const now = Date.now();
    const sourceUrls = row.inventoryItem.listing?.imageUrls ?? [];
    const condition = row.condition ? CONDITION_FROM_DB[row.condition]! : null;
    const price = row.priceMinor !== null && row.currency ? { amountMinor: row.priceMinor, currency: row.currency } : null;
    const channels: SellChannel[] = row.channels.map((c) => {
      const marketplace = c.marketplace as MarketplaceKey;
      const mode = this.publishers.get(marketplace)?.info.mode ?? 'api';
      const assisted = mode === 'assisted' && price && condition && c.status !== 'ENDED';
      return {
        marketplace,
        mode,
        status: c.status,
        url: c.url,
        simulated: c.provider === 'mock',
        assist: assisted ? { text: assistedText({ title: row.title, description: row.description, price, condition }), openUrl: FACEBOOK_CREATE_URL } : null,
        error: c.error,
        publishedAt: c.publishedAt?.toISOString() ?? null,
        endedReason: c.status === 'ENDED' ? endReason(c.endedReason) : null,
        removalPending: c.status === 'ENDED' && c.removalPending,
      };
    });
    const item = row.inventoryItem;
    const sale = item.sale;
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      status: row.status,
      title: row.title,
      description: row.description,
      price,
      currency: row.currency ?? item.currency,
      condition,
      itemSpecifics: z.array(itemSpecificSchema).catch([]).parse(row.itemSpecifics),
      photos: row.photos.map((p) => ({
        id: p.id,
        source: p.source === 'OWN' ? 'own' : 'source',
        url: p.source === 'OWN' ? signedMediaPath(p.ref, this.config.media.signingSecret, now) : p.ref,
        position: p.position,
      })),
      sourcePhotos: sourceUrls.filter((u) => !row.photos.some((p) => p.source === 'SOURCE' && p.ref === u)),
      channels,
      aiAssisted: row.aiAssisted,
      missing: this.missing(row),
      itemStatus: item.status,
      sale: sale
        ? { price: { amountMinor: sale.salePriceMinor, currency: sale.currency }, soldAt: sale.soldAt.toISOString(), marketplace: (sale.marketplace?.key as MarketplaceKey | undefined) ?? null }
        : null,
      removeManually: channels.filter((c) => c.removalPending).map((c) => c.marketplace),
      canDiscard: row.status === 'DRAFT' && !row.channels.some(isActiveChannel),
      canSell: row.status !== 'DISCARDED' && isHoldingStatus(item.status),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

const discarded = () => new AppException('CONFLICT', 'This listing was discarded - restore it first', HttpStatus.CONFLICT);
const notHeld = (status: string) =>
  new AppException('CONFLICT', status === 'SOLD' ? 'This item is already sold' : "This item isn't in stock any more - reopen it in Inventory first", HttpStatus.CONFLICT);
