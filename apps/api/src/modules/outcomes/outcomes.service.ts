import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  ExpectedSnapshot,
  InventoryItem,
  ListInventoryQuery,
  Money,
  Page,
  RecordSaleRequest,
  ReplacePurchaseCostsRequest,
  UpdateInventoryItemRequest,
} from '@rein-drop/contracts';
import { HOLDING_STATUSES } from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import type { ProductEvents } from '@rein-drop/telemetry';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { PRODUCT_EVENTS } from '../telemetry/telemetry.tokens.js';
import { toInventoryItem, type InventoryRow } from './ledger.js';

type Tx = Prisma.TransactionClient;

/** A date this far ahead of the server clock is still accepted (device clock skew). */
const CLOCK_SKEW_MS = 5 * 60_000;

const COST_SELECT = { id: true, category: true, amountMinor: true, currency: true, note: true, incurredAt: true } as const;
const ITEM_INCLUDE = {
  listing: { select: { url: true, marketplace: { select: { key: true } } } },
  costs: { where: { saleId: null }, select: COST_SELECT, orderBy: { createdAt: 'asc' } },
  sale: { include: { marketplace: { select: { key: true } }, costs: { select: COST_SELECT, orderBy: { createdAt: 'asc' } } } },
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
}

/**
 * The reselling ledger: inventory (bought, holding), purchase costs, sales, selling costs and the
 * realized result. Rules (contracts outcomes.ts): realized profit / loss only exists once sold;
 * holding is neither; a deal never bought never enters the ledger, so missed potential is never
 * an accounting loss. Costs are stored on the item (purchase) or on the sale (selling), never both.
 */
@Injectable()
export class OutcomesService {
  private readonly clock = () => new Date();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PRODUCT_EVENTS) private readonly events: ProductEvents,
  ) {}

  /**
   * One InventoryItem per deal (unique huntMatchId), created with its purchase costs and the
   * expected snapshot. Repeating it never changes an existing item - corrections go through
   * the inventory endpoints. Returns its id.
   */
  async recordDealPurchase(tx: Tx, purchase: DealPurchase): Promise<string> {
    const existing = await tx.inventoryItem.findUnique({ where: { huntMatchId: purchase.huntMatchId }, select: { id: true } });
    if (existing) return existing.id;
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
    return item.id;
  }

  async list(userId: string, query: ListInventoryQuery): Promise<Page<InventoryItem>> {
    const status =
      query.status === 'holding' ? { in: [...HOLDING_STATUSES] } : query.status === 'sold' ? { equals: 'SOLD' as const } : undefined;
    // The cursor must be one of the caller's own items: Prisma positions the page by the cursor
    // row, so another user's id would leak when that item was bought.
    if (query.cursor && !(await this.prisma.inventoryItem.findFirst({ where: { id: query.cursor, userId }, select: { id: true } }))) {
      throw invalid('cursor', 'Unknown cursor');
    }
    const rows = await this.prisma.inventoryItem.findMany({
      where: { userId, ...(status ? { status } : {}) },
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

  async get(userId: string, id: string): Promise<InventoryItem> {
    const row = await this.prisma.inventoryItem.findFirst({ where: { id, userId }, include: ITEM_INCLUDE });
    if (!row) throw notFound();
    return toInventoryItem(row as InventoryRow, this.clock());
  }

  /** Correct the purchase (title, price, date, notes) or move between In stock and Listed. */
  async update(userId: string, id: string, request: UpdateInventoryItemRequest): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    if (request.status && item.sale) throw conflict('This item is sold - undo the sale to change its status');
    if (request.purchasePrice && request.purchasePrice.currency !== item.currency && item.costs.length > 0) {
      throw invalid('body.purchasePrice.currency', `The purchase costs are in ${item.currency} - remove them first or use ${item.currency}`);
    }
    if (request.purchasedAt) {
      const purchasedAt = new Date(request.purchasedAt);
      this.notInFuture('body.purchasedAt', purchasedAt);
      if (item.sale && purchasedAt > item.sale.soldAt) throw invalid('body.purchasedAt', "Can't be after the sale date");
    }
    await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        title: request.title,
        purchasePriceMinor: request.purchasePrice?.amountMinor,
        currency: request.purchasePrice?.currency,
        purchasedAt: request.purchasedAt ? new Date(request.purchasedAt) : undefined,
        status: request.status,
        notes: request.notes,
      },
    });
    return this.get(userId, id);
  }

  /** Replaces the purchase costs (tax, shipping to you, repair, supplies, other). */
  async replacePurchaseCosts(userId: string, id: string, request: ReplacePurchaseCostsRequest): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    request.costs.forEach((c, i) => {
      if (c.amount.currency !== item.currency) throw invalid(`body.costs.${i}.amount.currency`, `Use ${item.currency}, like the purchase price`);
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.cost.deleteMany({ where: { inventoryItemId: id, saleId: null } });
      await this.writePurchaseCosts(tx, userId, id, request.costs, item.purchasedAt);
    });
    return this.get(userId, id);
  }

  /** Mark Sold, or correct the recorded sale (the sale and its selling costs are replaced). */
  async recordSale(userId: string, id: string, request: RecordSaleRequest): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    if (!item.sale && !(HOLDING_STATUSES as readonly string[]).includes(item.status)) {
      throw conflict('Only items you are holding can be marked sold');
    }
    const soldAt = new Date(request.soldAt);
    this.notInFuture('body.soldAt', soldAt);
    if (soldAt < item.purchasedAt) throw invalid('body.soldAt', "Can't be before the purchase date");
    const marketplaceId = request.marketplace
      ? (await this.prisma.marketplace.findUnique({ where: { key: request.marketplace }, select: { id: true } }))?.id ?? null
      : null;

    await this.prisma.$transaction(async (tx) => {
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
    return sold;
  }

  /** Undo a sale: the item is held again (In stock) and has no realized result. Idempotent. */
  async undoSale(userId: string, id: string): Promise<InventoryItem> {
    const item = await this.owned(userId, id);
    if (item.sale) {
      await this.prisma.$transaction(async (tx) => {
        await tx.sale.delete({ where: { inventoryItemId: id } }); // cascades its selling costs
        await tx.inventoryItem.update({ where: { id }, data: { status: 'IN_STOCK' } });
      });
    }
    return this.get(userId, id);
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

  /** 404 for another user's item (never reveal it exists). */
  private async owned(userId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        currency: true,
        purchasedAt: true,
        costs: { where: { saleId: null }, select: { id: true } },
        sale: { select: { soldAt: true } },
      },
    });
    if (!item) throw notFound();
    return item;
  }

  private notInFuture(path: string, at: Date) {
    if (at.getTime() > this.clock().getTime() + CLOCK_SKEW_MS) throw invalid(path, "Can't be in the future");
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
