import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AIProviderError, type AIProvider, type ListingDraftFacts } from '@rein-drop/ai-core';
import {
  expectedSnapshotSchema,
  itemSpecificSchema,
  SELL_PHOTO_BYTES_MAX,
  SELL_PHOTO_TYPES,
  SELL_PHOTOS_MAX,
  type ListingCondition,
  type MarketplaceKey,
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
import { MEDIA_STORAGE, signedMediaPath, type MediaStorage } from './media-storage.js';
import { assistedText, FACEBOOK_CREATE_URL, LISTING_PUBLISHERS, type ListingPublisher } from './publishers.js';

export const SELL_AI = Symbol('SELL_AI');

const CONDITION_TO_DB = { new: 'NEW', like_new: 'LIKE_NEW', good: 'GOOD', fair: 'FAIR', for_parts: 'FOR_PARTS' } as const;
const CONDITION_FROM_DB = Object.fromEntries(Object.entries(CONDITION_TO_DB).map(([k, v]) => [v, k])) as Record<string, ListingCondition>;

const LISTING_INCLUDE = {
  photos: { orderBy: { position: 'asc' } },
  channels: { orderBy: { createdAt: 'asc' } },
  inventoryItem: { include: { listing: { select: { title: true, description: true, conditionText: true, imageUrls: true, marketplace: { select: { key: true } } } } } },
} satisfies Prisma.SellListingInclude;
type ListingRow = Prisma.SellListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Sell workspace (decision 0019): one sell listing per inventory item - written by hand or from an
 * AI draft the seller edits - with photos (own uploads and/or the source listing's) and channels
 * (one per marketplace). Another user's item or listing is 404.
 */
@Injectable()
export class SellService {
  private readonly logger = new Logger(SellService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(LISTING_PUBLISHERS) private readonly publishers: Map<MarketplaceKey, ListingPublisher>,
    @Inject(SELL_AI) private readonly ai: AIProvider | null,
  ) {}

  marketplaces(): { items: SellMarketplace[]; uploads: boolean; ai: boolean } {
    return { items: [...this.publishers.values()].map((p) => p.info), uploads: this.media.enabled, ai: this.ai !== null };
  }

  /** "List" on an inventory item: its sell listing, created on first use (title and currency from the item). */
  async startForItem(userId: string, inventoryItemId: string): Promise<SellListing> {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, userId }, select: { id: true, title: true, currency: true, status: true } });
    if (!item) throw new AppException('NOT_FOUND', 'Inventory item not found', HttpStatus.NOT_FOUND);
    const existing = await this.prisma.sellListing.findUnique({ where: { inventoryItemId }, include: LISTING_INCLUDE });
    if (existing) return this.toDto(existing);
    if (item.status === 'SOLD') throw new AppException('CONFLICT', 'This item is already sold', HttpStatus.CONFLICT);
    const created = await this.prisma.sellListing.create({
      data: { userId, inventoryItemId, title: item.title.slice(0, 80), currency: item.currency },
      include: LISTING_INCLUDE,
    });
    return this.toDto(created);
  }

  async list(userId: string, status?: SellListingStatus): Promise<{ items: SellListing[] }> {
    const rows = await this.prisma.sellListing.findMany({ where: { userId, ...(status ? { status } : {}) }, include: LISTING_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100 });
    return { items: rows.map((r) => this.toDto(r)) };
  }

  async get(userId: string, id: string): Promise<SellListing> {
    return this.toDto(await this.owned(userId, id));
  }

  async update(userId: string, id: string, body: UpdateSellListingRequest): Promise<SellListing> {
    const row = await this.owned(userId, id);
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
  async publish(userId: string, id: string, marketplaces: MarketplaceKey[]): Promise<SellListing> {
    const row = await this.owned(userId, id);
    if (row.inventoryItem.status === 'SOLD') throw new AppException('CONFLICT', 'This item is already sold', HttpStatus.CONFLICT);
    const missing = this.missing(row);
    if (missing.length > 0) throw new ValidationFailedException(missing.map((message) => ({ path: 'listing', message })));
    const input = { listingId: row.id, title: row.title, description: row.description, price: { amountMinor: row.priceMinor!, currency: row.currency! }, condition: CONDITION_FROM_DB[row.condition!]!, photoCount: row.photos.length };

    for (const marketplace of [...new Set(marketplaces)]) {
      const publisher = this.publishers.get(marketplace);
      if (!publisher) throw new ValidationFailedException([{ path: 'marketplaces', message: `Listing on ${marketplace} isn't supported yet` }]);
      const live = row.channels.find((c) => c.marketplace === marketplace && (c.status === 'PUBLISHED' || c.status === 'AWAITING_CONFIRMATION'));
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
      };
      await this.prisma.sellChannel.upsert({ where: { sellListingId_marketplace: { sellListingId: row.id, marketplace } }, create: { sellListingId: row.id, marketplace, ...data }, update: data });
    }
    await this.syncStatus(row.id);
    return this.get(userId, id);
  }

  /** Assisted marketplaces: the seller posted it themselves (optionally with its link). */
  async confirmPosted(userId: string, id: string, marketplace: MarketplaceKey, url?: string): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const channel = row.channels.find((c) => c.marketplace === marketplace);
    if (!channel || channel.status !== 'AWAITING_CONFIRMATION') throw new AppException('CONFLICT', 'Nothing is waiting to be confirmed on that marketplace', HttpStatus.CONFLICT);
    await this.prisma.sellChannel.update({ where: { id: channel.id }, data: { status: 'PUBLISHED', url: url ?? null, publishedAt: new Date() } });
    await this.syncStatus(row.id);
    return this.get(userId, id);
  }

  /** Take it down on one marketplace (mock / assisted: recorded here; the seller removes it on Facebook). */
  async endChannel(userId: string, id: string, marketplace: MarketplaceKey): Promise<SellListing> {
    const row = await this.owned(userId, id);
    const channel = row.channels.find((c) => c.marketplace === marketplace);
    if (!channel) throw new AppException('NOT_FOUND', 'Not listed on that marketplace', HttpStatus.NOT_FOUND);
    await this.prisma.sellChannel.update({ where: { id: channel.id }, data: { status: 'ENDED' } });
    await this.syncStatus(row.id);
    return this.get(userId, id);
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
    const active = row.channels.some((c) => c.status === 'PUBLISHED' || c.status === 'AWAITING_CONFIRMATION');
    const status: SellListingStatus = active ? 'PUBLISHED' : row.channels.some((c) => c.status === 'ENDED') ? 'ENDED' : 'DRAFT';
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
      };
    });
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      status: row.status,
      title: row.title,
      description: row.description,
      price,
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
