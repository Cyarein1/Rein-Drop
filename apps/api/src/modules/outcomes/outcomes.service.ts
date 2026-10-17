import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  CancelItemRequest,
  CreateInventoryItemRequest,
  EventSource,
  ExpectedSnapshot,
  InventoryAction,
  InventoryCounts,
  InventorySection,
  InventoryEventDetails,
  InventoryEventList,
  InventoryItem,
  ListInventoryQuery,
  MarketplaceKey,
  Money,
  Page,
  RecordSaleRequest,
  ReplacePurchaseCostsRequest,
  ReturnItemRequest,
  UpdateInventoryItemRequest,
  WriteOffItemRequest,
} from '@rein-drop/contracts';
import { actionBlock, CLOSED_STATUSES, HOLDING_STATUSES, INVENTORY_SECTIONS, isClosedStatus } from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import type { ProductEvents } from '@rein-drop/telemetry';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { MatchingService } from '../matching/matching.service.js';
import { PRODUCT_EVENTS } from '../telemetry/telemetry.tokens.js';
import { toInventoryEvent, writeItemEvent } from './item-events.js';
import { isActiveChannel, toInventoryItem, type InventoryRow } from './ledger.js';

type Tx = Prisma.TransactionClient;

/** A date this far ahead of the server clock is still accepted (device clock skew). */
const CLOCK_SKEW_MS = 5 * 60_000;

const COST_SELECT = { id: true, category: true, amountMinor: true, currency: true, note: true, incurredAt: true } as const;
const ITEM_INCLUDE = {
  listing: { select: { url: true, marketplace: { select: { key: true } } } },
  costs: { where: { saleId: null }, select: COST_SELECT, orderBy: { createdAt: 'asc' } },
  sale: { include: { marketplace: { select: { key: true } }, costs: { select: COST_SELECT, orderBy: { createdAt: 'asc' } } } },
  sellListing: { select: { id: true, status: true, priceMinor: true, currency: true, channels: { select: { marketplace: true, status: true, removalPending: true }, orderBy: { createdAt: 'asc' } } } },
} satisfies Prisma.InventoryItemInclude;

export interface PurchaseCost {
  category: 'TAX' | 'SHIPPING' | 'REPAIR' | 'SUPPLIES' | 'OTHER';
  amount: Money;
  note?: string;
}

export interface DealPurchase {
  userId: string;
  huntMatchId: string;
  listingId: string;
  title: string;
  /** What the user actually paid (defaults to the asking price upstream). */
  price: Money;
  purchasedAt: Date;
  costs?: readonly PurchaseCost[];
  /** What Rein Drop expected at Bought - frozen, never edited afterwards. */
  expected?: ExpectedSnapshot;
  /** Marketplace of the deal's listing (recorded in the BOUGHT event). */
  marketplace?: MarketplaceKey;
}

/** Why an item stopped being held - what its marketplace listings should do. */
export type ItemExitReason = 'sold' | 'returned' | 'written_off' | 'cancelled';

export interface ItemExit {
  userId: string;
  itemId: string;
  reason: ItemExitReason;
  /** sold: the marketplace it sold on (null = elsewhere). */
  soldOn: MarketplaceKey | null;
  source: EventSource | null;
}

/** What happened to the item's marketplace listings. */
export interface ChannelsClosed {
  ended: MarketplaceKey[];
  /** Ended here, but the seller must take them down on the marketplace (assisted). */
  removeManually: MarketplaceKey[];
}

/**
 * Runs inside the transaction that records a sale / return / write-off / cancel. Sell registers
 * one (it owns the listings): ending every live channel is part of the same change, so an item
 * can't be sold here and still be buyable there (decision 0021).
 */
export type ItemExitListener = (tx: Tx, exit: ItemExit) => Promise<ChannelsClosed>;

const NO_CHANNELS: ChannelsClosed = { ended: [], removeManually: [] };

const OWNED_SELECT = {
  id: true,
  userId: true,
  title: true,
  notes: true,
  status: true,
  currency: true,
  purchasePriceMinor: true,
  purchasedAt: true,
  huntMatchId: true,
  closedAt: true,
  refundMinor: true,
  costs: { where: { saleId: null }, select: { id: true } },
  sale: { select: { soldAt: true, salePriceMinor: true, currency: true } },
  sellListing: { select: { channels: { select: { status: true } } } },
} satisfies Prisma.InventoryItemSelect;
type Owned = Prisma.InventoryItemGetPayload<{ select: typeof OWNED_SELECT }>;

/**
 * The reselling ledger: inventory (bought, holding), purchase costs, sales, selling costs and the
 * realized result. Rules (contracts outcomes.ts): realized profit / loss only exists once sold (or
 * once returned / written off); holding is neither; a deal never bought never enters the ledger, so
 * missed potential is never an accounting loss. Costs are stored on the item (purchase) or on the
 * sale (selling), never both.
 *
 * Nothing is deleted (decision 0021): mistakes and endings are statuses moved by the state machine
 * in contracts (inventory-lifecycle.ts), and every change writes an item event (the audit trail).
 */
@Injectable()
export class OutcomesService {
  private readonly clock = () => new Date();
  private readonly exitListeners: ItemExitListener[] = [];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PRODUCT_EVENTS) private readonly events: ProductEvents,
    private readonly matching: MatchingService,
  ) {}

  /** Sell registers how an item's marketplace listings end when it stops being held. */
  onItemExit(listener: ItemExitListener): void {
    this.exitListeners.push(listener);
  }

  /**
   * One InventoryItem per deal (unique huntMatchId), created with its purchase costs and the
   * expected snapshot. Repeating it never changes an existing item - corrections go through the
   * inventory endpoints - except a CANCELLED one (bought by mistake, then bought for real): it is
   * bought again with the new price, date and costs. Returns its id.
   */
  async recordDealPurchase(tx: Tx, purchase: DealPurchase, source: EventSource | null = null): Promise<string> {
    const details = { dealId: purchase.huntMatchId, price: purchase.price, ...(purchase.marketplace ? { marketplace: purchase.marketplace } : {}) };
    const existing = await tx.inventoryItem.findUnique({ where: { huntMatchId: purchase.huntMatchId }, select: { id: true, status: true } });
    if (existing && existing.status !== 'CANCELLED') return existing.id;
    if (existing) {
      await tx.inventoryItem.update({
        where: { id: existing.id },
        data: {
          status: 'IN_STOCK',
          purchasePriceMinor: purchase.price.amountMinor,
          currency: purchase.price.currency,
          purchasedAt: purchase.purchasedAt,
          expected: purchase.expected ?? undefined,
          closedAt: null,
          closedNote: null,
          refundMinor: null,
        },
      });
      await tx.cost.deleteMany({ where: { inventoryItemId: existing.id, saleId: null } });
      await this.writePurchaseCosts(tx, purchase.userId, existing.id, purchase.costs ?? [], purchase.purchasedAt);
      await writeItemEvent(tx, { itemId: existing.id, userId: purchase.userId, type: 'BOUGHT', source, details });
      return existing.id;
    }
    const item = await tx.inventoryItem.create({
      data: {
        userId: purchase.userId,
        huntMatchId: purchase.huntMatchId,
        listingId: purchase.listingId,
        title: purchase.title,
        purchasePriceMinor: purchase.price.amountMinor,
        currency: purchase.price.currency,
        purchasedAt: purchase.purchasedAt,
        expected: purchase.expected ?? undefined,
      },
      select: { id: true },
    });
    await this.writePurchaseCosts(tx, purchase.userId, item.id, purchase.costs ?? [], purchase.purchasedAt);
    await writeItemEvent(tx, { itemId: item.id, userId: purchase.userId, type: 'BOUGHT', source, details });
    return item.id;
  }

  /** "Add item": something bought outside Rein Drop. Works like any other item afterwards. */
  async create(userId: string, request: CreateInventoryItemRequest, source: EventSource | null): Promise<InventoryItem> {
    const purchasedAt = new Date(request.purchasedAt);
    this.notInFuture('body.purchasedAt', purchasedAt);
    const where = request.boughtFrom;
    const id = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          userId,
          title: request.title,
          purchasePriceMinor: request.purchasePrice.amountMinor,
          currency: request.purchasePrice.currency,
          purchasedAt,
          notes: request.notes || null,
          boughtFromMarketplace: where?.kind === 'marketplace' ? where.marketplace : null,
          boughtFromText: where?.kind === 'other' ? where.text : null,
        },
        select: { id: true },
      });
      await this.writePurchaseCosts(tx, userId, item.id, request.costs, purchasedAt);
      await writeItemEvent(tx, {
        itemId: item.id,
        userId,
        type: 'ADDED_MANUALLY',
        source,
        at: this.clock(),
        details: {
          price: request.purchasePrice,
          ...(where?.kind === 'marketplace' ? { marketplace: where.marketplace } : {}),
          ...(where?.kind === 'other' ? { where: where.text } : {}),
        },
      });
      return item.id;
    });
    return this.get(userId, id);
  }

  async list(userId: string, query: ListInventoryQuery): Promise<Page<InventoryItem>> {
    const filter = query.section ? sectionWhere(query.section) : this.statusWhere(query.status);
    // The cursor must be one of the caller's own items: Prisma positions the page by the cursor
    // row, so another user's id would leak when that item was bought.
    if (query.cursor && !(await this.prisma.inventoryItem.findFirst({ where: { id: query.cursor, userId }, select: { id: true } }))) {
      throw invalid('cursor', 'Unknown cursor');
    }
    const rows = await this.prisma.inventoryItem.findMany({
      where: { userId, ...filter },
      include: ITEM_INCLUDE,
      orderBy: [{ purchasedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const now = this.clock();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((r) => toInventoryItem(r as InventoryRow, now)),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Chip counts for the Sell area: items per section and listings per tab. */
  async counts(userId: string): Promise<InventoryCounts> {
    const [holding, listed, sold, other, listings] = await Promise.all([
      ...INVENTORY_SECTIONS.map((section) => this.prisma.inventoryItem.count({ where: { userId, ...sectionWhere(section) } })),
      this.prisma.sellListing.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
    ] as const);
    const of = (status: string) => (listings as { status: string; _count: { _all: number } }[]).find((l) => l.status === status)?._count._all ?? 0;
    return {
      holding: holding as number,
      listed: listed as number,
      sold: sold as number,
      other: other as number,
      listings: { drafts: of('DRAFT'), active: of('PUBLISHED'), discarded: of('DISCARDED') },
    };
  }

  private statusWhere(statusFilter: ListInventoryQuery['status']): Prisma.InventoryItemWhereInput {
    const status =
      statusFilter === 'holding'
        ? { in: [...HOLDING_STATUSES] }
        : statusFilter === 'sold'
          ? { equals: 'SOLD' as const }
          : statusFilter === 'closed'
            ? { in: [...CLOSED_STATUSES] }
            : undefined;
    return status ? { status } : {};
  }

  async get(userId: string, id: string): Promise<InventoryItem> {
    const row = await this.prisma.inventoryItem.findFirst({ where: { id, userId }, include: ITEM_INCLUDE });
    if (!row) throw notFound();
    return toInventoryItem(row as InventoryRow, this.clock());
  }

  /** The item's timeline (audit trail), oldest first. */
  async timeline(userId: string, id: string): Promise<InventoryEventList> {
    await this.owned(userId, id);
    const rows = await this.prisma.inventoryEvent.findMany({ where: { inventoryItemId: id, userId }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
    return { items: rows.map(toInventoryEvent) };
  }

  /** Correct the purchase (title, price, date, notes) or move between In stock and Listed. */
  async update(userId: string, id: string, request: UpdateInventoryItemRequest, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'edit_purchase');
    if (request.status && request.status !== item.status) {
      if (item.sale) throw conflict('This item is sold - undo the sale to change its status');
      this.allow(item, request.status === 'LISTED' ? 'mark_listed' : 'mark_unlisted');
    }
    if (request.purchasePrice && request.purchasePrice.currency !== item.currency && item.costs.length > 0) {
      throw invalid('body.purchasePrice.currency', `The purchase costs are in ${item.currency} - remove them first or use ${item.currency}`);
    }
    if (request.purchasePrice && request.purchasePrice.currency !== item.currency && item.refundMinor !== null) {
      throw invalid('body.purchasePrice.currency', `The refund is in ${item.currency} - use ${item.currency}`);
    }
    let purchasedAt: Date | undefined;
    if (request.purchasedAt) {
      purchasedAt = new Date(request.purchasedAt);
      this.notInFuture('body.purchasedAt', purchasedAt);
      if (item.sale && purchasedAt > item.sale.soldAt) throw invalid('body.purchasedAt', "Can't be after the sale date");
      if (item.closedAt && purchasedAt > item.closedAt) throw invalid('body.purchasedAt', "Can't be after the date it was returned or written off");
    }
    const fields = (['title', 'purchasePrice', 'purchasedAt', 'notes'] as const).filter((f) => {
      if (request[f] === undefined) return false;
      if (f === 'title') return request.title !== item.title;
      if (f === 'purchasePrice') return request.purchasePrice!.amountMinor !== item.purchasePriceMinor || request.purchasePrice!.currency !== item.currency;
      if (f === 'purchasedAt') return purchasedAt!.getTime() !== item.purchasedAt.getTime();
      return (request.notes ?? null) !== item.notes;
    });
    const statusChanged = request.status !== undefined && request.status !== item.status;
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id },
        data: {
          title: request.title,
          purchasePriceMinor: request.purchasePrice?.amountMinor,
          currency: request.purchasePrice?.currency,
          purchasedAt,
          status: request.status,
          notes: request.notes,
        },
      });
      if (fields.length > 0) {
        await writeItemEvent(tx, {
          itemId: id,
          userId,
          type: 'PURCHASE_EDITED',
          source,
          details: {
            fields,
            ...(fields.includes('purchasePrice') ? { before: money(item.purchasePriceMinor, item.currency), price: request.purchasePrice! } : {}),
          },
        });
      }
      if (statusChanged) await writeItemEvent(tx, { itemId: id, userId, type: request.status === 'LISTED' ? 'LISTED' : 'UNLISTED', source });
    });
    return this.get(userId, id);
  }

  /** Replaces the purchase costs (tax, shipping to you, repair, supplies, other). */
  async replacePurchaseCosts(userId: string, id: string, request: ReplacePurchaseCostsRequest, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'edit_purchase');
    request.costs.forEach((c, i) => {
      if (c.amount.currency !== item.currency) throw invalid(`body.costs.${i}.amount.currency`, `Use ${item.currency}, like the purchase price`);
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.cost.deleteMany({ where: { inventoryItemId: id, saleId: null } });
      await this.writePurchaseCosts(tx, userId, id, request.costs, item.purchasedAt);
      await writeItemEvent(tx, {
        itemId: id,
        userId,
        type: 'COSTS_EDITED',
        source,
        details: { count: request.costs.length, total: money(request.costs.reduce((s, c) => s + c.amount.amountMinor, 0), item.currency) },
      });
    });
    return this.get(userId, id);
  }

  /** Mark Sold, or correct the recorded sale (the sale and its selling costs are replaced). */
  async recordSale(userId: string, id: string, request: RecordSaleRequest, source: EventSource | null = null): Promise<InventoryItem> {
    return (await this.recordSaleWithChannels(userId, id, request, { source, via: 'inventory', newOnly: false })).item;
  }

  /**
   * Records (or corrects) the sale and, in the same transaction, ends the item's live marketplace
   * listings and its sell listing (decision 0021). `newOnly` refuses a correction (Sold from a listing).
   */
  async recordSaleWithChannels(
    userId: string,
    id: string,
    request: RecordSaleRequest,
    opts: { source: EventSource | null; via: 'inventory' | 'listing'; newOnly: boolean },
  ): Promise<{ item: InventoryItem; channels: ChannelsClosed }> {
    const item = await this.owned(userId, id);
    if (item.sale && opts.newOnly) throw conflict('This item is already sold - correct the sale from Inventory');
    if (!item.sale && !(HOLDING_STATUSES as readonly string[]).includes(item.status)) {
      throw conflict('Only items you are holding can be marked sold');
    }
    const soldAt = new Date(request.soldAt);
    this.notInFuture('body.soldAt', soldAt);
    if (soldAt < item.purchasedAt) throw invalid('body.soldAt', "Can't be before the purchase date");
    const marketplaceId = request.marketplace
      ? ((await this.prisma.marketplace.findUnique({ where: { key: request.marketplace }, select: { id: true } }))?.id ?? null)
      : null;

    const channels = await this.prisma.$transaction(async (tx) => {
      const data = { marketplaceId, salePriceMinor: request.price.amountMinor, currency: request.price.currency, soldAt };
      const sale = await tx.sale.upsert({
        where: { inventoryItemId: id },
        create: { userId, inventoryItemId: id, ...data },
        update: data,
        select: { id: true },
      });
      await tx.cost.deleteMany({ where: { saleId: sale.id } });
      if (request.costs.length > 0) {
        await tx.cost.createMany({
          data: request.costs.map((c) => ({
            userId,
            saleId: sale.id,
            category: c.category,
            amountMinor: c.amount.amountMinor,
            currency: c.amount.currency,
            incurredAt: soldAt,
            note: c.note ?? null,
          })),
        });
      }
      await tx.inventoryItem.update({ where: { id }, data: { status: 'SOLD' } });
      // A correction ends anything that went live again since (normally nothing is live).
      const closed = await this.exit(tx, { userId, itemId: id, reason: 'sold', soldOn: request.marketplace, source: opts.source });
      await writeItemEvent(tx, {
        itemId: id,
        userId,
        type: item.sale ? 'SALE_CORRECTED' : 'SOLD',
        source: opts.source,
        details: {
          price: request.price,
          ...(request.marketplace ? { marketplace: request.marketplace } : {}),
          via: opts.via,
          ...(closed.ended.length > 0 ? { endedChannels: closed.ended } : {}),
          ...(closed.removeManually.length > 0 ? { removeManually: closed.removeManually } : {}),
        },
      });
      return closed;
    });
    const sold = await this.get(userId, id);
    // A new sale only - correcting a recorded sale is not another one. Direction, never amounts.
    if (!item.sale) {
      this.events.track('sale_recorded', userId, {
        inventoryItemId: id,
        fromDeal: sold.dealId !== null,
        result: saleDirection(sold.result),
        daysHeld: sold.daysHeld,
      });
    }
    return { item: sold, channels };
  }

  /**
   * Undo a sale: the item is held again (In stock) and has no realized result. Idempotent. Its
   * marketplace listings stay ended - the seller republishes from Sell if they want to.
   */
  async undoSale(userId: string, id: string, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    if (item.sale) {
      const sale = item.sale;
      await this.prisma.$transaction(async (tx) => {
        await tx.sale.delete({ where: { inventoryItemId: id } }); // cascades its selling costs
        await tx.inventoryItem.update({ where: { id }, data: { status: 'IN_STOCK' } });
        await writeItemEvent(tx, { itemId: id, userId, type: 'SALE_UNDONE', source, details: { price: money(sale.salePriceMinor, sale.currency) } });
      });
    }
    return this.get(userId, id);
  }

  /** Returned to the seller / refunded. Live listings end. Result = refund - cost basis. */
  async returnItem(userId: string, id: string, request: ReturnItemRequest, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'return');
    const refund = request.refund ?? money(item.purchasePriceMinor, item.currency);
    if (refund.currency !== item.currency) throw invalid('body.refund.currency', `Use ${item.currency}, like the purchase price`);
    const at = this.closingDate('body.returnedAt', request.returnedAt, item.purchasedAt);
    await this.close(item, { status: 'RETURNED', reason: 'returned', at, note: request.note, refundMinor: refund.amountMinor, source, details: { refund } });
    return this.get(userId, id);
  }

  /** Lost, broken or unsellable: the whole cost becomes a realized loss. Live listings end. */
  async writeOff(userId: string, id: string, request: WriteOffItemRequest, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'write_off');
    const at = this.closingDate('body.writtenOffAt', request.writtenOffAt, item.purchasedAt);
    await this.close(item, { status: 'WRITTEN_OFF', reason: 'written_off', at, note: request.note, refundMinor: null, source, details: request.reason ? { reason: request.reason } : {} });
    return this.get(userId, id);
  }

  /**
   * "Bought by mistake" / Undo bought: only while it has no sale and nothing is live on a
   * marketplace. A deal's item re-opens the deal (not bought any more; history kept in the events).
   * A draft listing is discarded (restorable). The item is left out of every figure.
   */
  async cancel(userId: string, id: string, request: CancelItemRequest, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'cancel');
    await this.close(item, { status: 'CANCELLED', reason: 'cancelled', at: this.clock(), note: request.note, refundMinor: null, source, details: {} });
    return this.get(userId, id);
  }

  /**
   * Back to In stock from Returned / Written off / Cancelled (a mistake, or it came back). A
   * cancelled deal item marks its deal bought again. Listings stay as they are (ended / discarded).
   */
  async reopen(userId: string, id: string, source: EventSource | null = null): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    this.allow(item, 'reopen');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventoryItem.updateMany({
        where: { id, status: item.status },
        data: { status: 'IN_STOCK', closedAt: null, closedNote: null, refundMinor: null },
      });
      if (count !== 1) throw conflict('This item changed meanwhile - reload it and try again');
      if (item.status === 'CANCELLED' && item.huntMatchId) await this.matching.markBought(tx, item.huntMatchId, this.clock());
      await writeItemEvent(tx, { itemId: id, userId, type: 'REOPENED', source, details: { from: item.status } });
    });
    return this.get(userId, id);
  }

  private async close(
    item: Owned,
    c: {
      status: 'RETURNED' | 'WRITTEN_OFF' | 'CANCELLED';
      reason: Exclude<ItemExitReason, 'sold'>;
      at: Date;
      note: string | undefined;
      refundMinor: number | null;
      source: EventSource | null;
      details: InventoryEventDetails;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Conditional on the status read above: a concurrent change (e.g. a sale) wins, this one fails.
      const { count } = await tx.inventoryItem.updateMany({
        where: { id: item.id, status: item.status },
        data: { status: c.status, closedAt: c.at, closedNote: c.note ?? null, refundMinor: c.refundMinor },
      });
      if (count !== 1) throw conflict('This item changed meanwhile - reload it and try again');
      const closed = await this.exit(tx, { userId: item.userId, itemId: item.id, reason: c.reason, soldOn: null, source: c.source });
      const dealReopened = c.status === 'CANCELLED' && item.huntMatchId ? await this.matching.unmarkBought(tx, item.huntMatchId, this.clock()) : false;
      await writeItemEvent(tx, {
        itemId: item.id,
        userId: item.userId,
        type: c.status,
        source: c.source,
        // A return / write-off is dated when it happened; a cancel is now (after its listing changes).
        at: c.status === 'CANCELLED' ? undefined : c.at,
        details: {
          ...c.details,
          ...(c.note ? { note: c.note } : {}),
          ...(c.status === 'CANCELLED' ? { dealReopened } : {}),
          ...(closed.ended.length > 0 ? { endedChannels: closed.ended } : {}),
          ...(closed.removeManually.length > 0 ? { removeManually: closed.removeManually } : {}),
        },
      });
    });
  }

  private async exit(tx: Tx, exit: ItemExit): Promise<ChannelsClosed> {
    const result: ChannelsClosed = { ended: [], removeManually: [] };
    for (const listener of this.exitListeners) {
      const r = await listener(tx, exit);
      result.ended.push(...r.ended);
      result.removeManually.push(...r.removeManually);
    }
    return this.exitListeners.length > 0 ? result : NO_CHANNELS;
  }

  private async writePurchaseCosts(tx: Tx, userId: string, inventoryItemId: string, costs: readonly PurchaseCost[], incurredAt: Date) {
    if (costs.length === 0) return;
    await tx.cost.createMany({
      data: costs.map((c) => ({
        userId,
        inventoryItemId,
        category: c.category,
        amountMinor: c.amount.amountMinor,
        currency: c.amount.currency,
        incurredAt,
        note: c.note ?? null,
      })),
    });
  }

  /** 409 when the state machine doesn't allow the action from the item's status. */
  private allow(item: Owned, action: InventoryAction) {
    const activeChannels = item.sellListing?.channels.filter(isActiveChannel).length ?? 0;
    const block = actionBlock(action, { status: item.status, activeChannels });
    if (!block) return;
    if (block === 'live_on_marketplace') {
      throw conflict(
        action === 'cancel'
          ? "It's live on a marketplace - take the listing down in Sell first, then undo the purchase"
          : "It's live on a marketplace - take the listing down in Sell first",
      );
    }
    if (item.status === 'CANCELLED') throw conflict('This purchase was cancelled - reopen it first');
    if (isClosedStatus(item.status)) throw conflict(`This item is ${item.status === 'RETURNED' ? 'returned' : 'written off'} - reopen it first`);
    if (item.status === 'SOLD') throw conflict('This item is sold - undo the sale first');
    throw conflict("That isn't possible for an item you are holding");
  }

  /** 404 for another user's item (never reveal it exists). */
  private async owned(userId: string, id: string): Promise<Owned> {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, userId }, select: OWNED_SELECT });
    if (!item) throw notFound();
    return item;
  }

  private notInFuture(path: string, at: Date) {
    if (at.getTime() > this.clock().getTime() + CLOCK_SKEW_MS) throw invalid(path, "Can't be in the future");
  }

  /** When an item was returned / written off: now by default; never in the future or before the purchase. */
  private closingDate(path: string, value: string | undefined, purchasedAt: Date): Date {
    const now = this.clock();
    if (!value) return now < purchasedAt ? purchasedAt : now;
    const at = new Date(value);
    this.notInFuture(path, at);
    if (at < purchasedAt) throw invalid(path, "Can't be before the purchase date");
    return at;
  }
}


const money = (amountMinor: number, currency: string): Money => ({ amountMinor, currency });

/** Being sold: a DRAFT or PUBLISHED sell listing. */
const BEING_SOLD: Prisma.InventoryItemWhereInput = { sellListing: { is: { status: { in: ['DRAFT', 'PUBLISHED'] } } } };

/** The Sell-area sections (INVENTORY_SECTIONS in contracts) - each item is in exactly one. */
export function sectionWhere(section: InventorySection): Prisma.InventoryItemWhereInput {
  switch (section) {
    case 'holding':
      return { status: 'IN_STOCK', NOT: BEING_SOLD };
    case 'listed':
      return { OR: [{ status: 'LISTED' }, { status: 'IN_STOCK', ...BEING_SOLD }] };
    case 'sold':
      return { status: 'SOLD' };
    case 'other':
      return { status: { in: [...CLOSED_STATUSES] } };
  }
}
const notFound = () => new AppException('NOT_FOUND', 'Inventory item not found', HttpStatus.NOT_FOUND);
const conflict = (message: string) => new AppException('CONFLICT', message, HttpStatus.CONFLICT);
const invalid = (path: string, message: string) => new ValidationFailedException([{ path, message }]);

/** Profit / loss direction of a realized result (product events never carry amounts). */
function saleDirection(result: InventoryItem['result']): 'profit' | 'loss' | 'break_even' | 'unavailable' {
  if (!result || result.status !== 'ok') return 'unavailable';
  const profit = result.realizedProfit.amountMinor;
  return profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'break_even';
}
