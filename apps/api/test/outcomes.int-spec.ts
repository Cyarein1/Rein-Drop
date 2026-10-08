/**
 * Outcomes ledger against a REAL PostgreSQL: Bought -> InventoryItem (purchase costs + frozen
 * expected snapshot, linked to its deal), holding, Mark Sold with selling costs and realized P/L,
 * corrections, undo, and that a deal never bought never enters the ledger.
 * Run with `pnpm --filter api test:int`. Creates throwaway users, a hunt, listings and matches,
 * and deletes everything afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type DealDetail, type InventoryItem } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { computeEconomics, DEFAULT_SCORING_POLICY } from '@rein-drop/scoring';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const OTHER = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-outcomes-${randomUUID().slice(0, 8)}-`;
const DAY = 86_400_000;
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const USD = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

describe('Outcomes ledger (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let otherUserId: string;
  let ebay: string;
  const deal: Record<'estimated' | 'plain' | 'ignored' | 'loss', string> = { estimated: '', plain: '', ignored: '', loss: '' };
  const as = (req: request.Test, subject = SUBJECT) => req.set(DEV_AUTH_HEADER, subject);
  const server = () => app.getHttpServer();
  const item = async (id: string) => (await as(request(server()).get(`/inventory/${id}`)).expect(200)).body as InventoryItem;
  const list = async (query = '') => (await as(request(server()).get(`/inventory${query}`)).expect(200)).body as { items: InventoryItem[]; nextCursor: string | null };
  const buy = async (id: string, body: object) => ((await as(request(server()).post(`/deals/${id}/bought`)).send(body).expect(200)).body as DealDetail).decision.inventoryItemId!;

  async function fixture(name: keyof typeof deal, huntId: string, o: { price: number; shipping?: number; resale?: number }) {
    const listing = await prisma.listing.create({
      data: { marketplaceId: ebay, externalId: `${PREFIX}${name}`, url: `https://dev.example/ebay/${name}`, title: `Nintendo Switch ${name}`, priceMinor: o.price, currency: 'ZAR', status: 'ACTIVE', imageUrls: [] },
    });
    const match = await prisma.huntMatch.create({ data: { huntId, listingId: listing.id, status: 'NEW', relevanceScore: 100, reasons: [] } });
    const economics = computeEconomics(
      {
        asking: ZAR(o.price),
        knownCosts: o.shipping ? [{ kind: 'shipping', label: 'Shipping', amount: ZAR(o.shipping) }] : [],
        maxPrice: null,
        target: null,
        comparables: o.resale
          ? { source: 'int-test', sampleSize: 8, low: ZAR(o.resale - 50_000), typical: ZAR(o.resale), high: ZAR(o.resale + 50_000), asOf: new Date().toISOString() }
          : null,
      },
      DEFAULT_SCORING_POLICY,
    );
    await prisma.dealAnalysis.create({
      data: {
        listingId: listing.id,
        huntMatchId: match.id,
        status: 'COMPLETED',
        provider: 'mock',
        inputHash: randomUUID(),
        scoringVersion: 1,
        economics: economics as never,
        strength: 'strong',
        confidence: 'medium',
        score: 70,
        scoring: { strengthReasons: [], confidenceReasons: [], alert: { eligible: false, kind: null, rules: [], blockedBy: [] } },
        completedAt: new Date(),
      },
    });
    deal[name] = match.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (subject: string) => prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } });
    userId = (await user(SUBJECT)).id;
    otherUserId = (await user(OTHER)).id;
    ebay = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    // PAUSED + far-future poll: a running worker never picks this hunt up.
    const hunt = await prisma.hunt.create({
      data: { userId, name: 'Switch', query: 'Nintendo Switch', status: 'PAUSED', marketplaces: { create: [{ marketplaceId: ebay, nextPollAt: new Date('2036-01-01T00:00:00Z') }] } },
    });
    await fixture('estimated', hunt.id, { price: 400_000, shipping: 15_000, resale: 600_000 });
    await fixture('plain', hunt.id, { price: 200_000 });
    await fixture('ignored', hunt.id, { price: 100_000, resale: 900_000 });
    await fixture('loss', hunt.id, { price: 300_000 });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: { in: Object.values(deal).filter(Boolean) } } });
      for (const id of [userId, otherUserId]) if (id) await prisma.user.delete({ where: { id } }); // hunts, matches, inventory, sales, costs
      await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    }
  });

  let estimatedId = '';

  it('Bought creates an inventory item with purchase costs and a frozen expected snapshot, linked to the deal', async () => {
    const purchasedAt = new Date(Date.now() - 10 * DAY).toISOString();
    // Costs must be in the price's currency.
    await as(request(server()).post(`/deals/${deal.estimated}/bought`)).send({ costs: [{ category: 'TAX', amount: USD(100) }] }).expect(400);
    estimatedId = await buy(deal.estimated, {
      purchasedAt,
      costs: [
        { category: 'TAX', amount: ZAR(60_000) },
        { category: 'SHIPPING', amount: ZAR(15_000), note: 'Courier' },
      ],
    });

    const it = await item(estimatedId);
    expect(it).toMatchObject({
      status: 'IN_STOCK',
      holding: true,
      dealId: deal.estimated,
      source: { marketplace: 'ebay', url: 'https://dev.example/ebay/estimated' },
      purchase: { price: ZAR(400_000), purchasedAt, total: ZAR(475_000) },
      sale: null,
      result: null, // holding: no profit, no loss
      daysHeld: 10,
      expected: { askingPrice: ZAR(400_000), knownCosts: ZAR(15_000), estimatedResale: ZAR(600_000), estimatedUpside: ZAR(185_000), strength: 'strong', confidence: 'medium' },
      comparison: {
        purchasePrice: { expected: ZAR(400_000), actual: ZAR(400_000), difference: ZAR(0) },
        salePrice: { expected: ZAR(600_000), actual: null, difference: null },
        profit: { expected: ZAR(185_000), actual: null, difference: null },
      },
    });
    expect(it.purchase.costs.map((c) => [c.category, c.amount.amountMinor, c.note])).toEqual([
      ['TAX', 60_000, null],
      ['SHIPPING', 15_000, 'Courier'],
    ]);

    // The deal points at its item, and repeating Bought never changes it.
    const detail = (await as(request(server()).get(`/deals/${deal.estimated}`)).expect(200)).body as DealDetail;
    expect(detail.decision.inventoryItemId).toBe(estimatedId);
    await buy(deal.estimated, { price: ZAR(1), costs: [{ category: 'OTHER', amount: ZAR(1) }] });
    expect((await item(estimatedId)).purchase).toMatchObject({ price: ZAR(400_000), total: ZAR(475_000) });
  });

  it('without an estimate, the snapshot has no invented resale or upside', async () => {
    const id = await buy(deal.plain, {});
    expect(await item(id)).toMatchObject({
      expected: { askingPrice: ZAR(200_000), knownCosts: null, estimatedResale: null, estimatedUpside: null },
      purchase: { costs: [], total: ZAR(200_000) },
    });
  });

  it('Mark Sold validates the date and currency, then records the realized P/L with fees and shipping', async () => {
    const sale = (body: object) => as(request(server()).put(`/inventory/${estimatedId}/sale`)).send(body);
    const soldAt = new Date(Date.now() - 2 * DAY).toISOString();
    expect((await sale({ price: ZAR(650_000), soldAt: new Date(Date.now() - 20 * DAY).toISOString() }).expect(400)).body.details[0].path).toBe('body.soldAt');
    await sale({ price: ZAR(650_000), soldAt: new Date(Date.now() + DAY).toISOString() }).expect(400);
    await sale({ price: ZAR(650_000), soldAt, costs: [{ category: 'MARKETPLACE_FEE', amount: USD(1) }] }).expect(400);
    await sale({ price: ZAR(650_000), soldAt, costs: [{ category: 'TAX', amount: ZAR(1) }] }).expect(400); // a purchase category

    const sold = (await sale({
      price: ZAR(650_000),
      soldAt,
      marketplace: 'ebay',
      costs: [
        { category: 'MARKETPLACE_FEE', amount: ZAR(65_000) },
        { category: 'PAYMENT_FEE', amount: ZAR(10_000) },
        { category: 'SHIPPING', amount: ZAR(20_000) },
      ],
    }).expect(200)).body as InventoryItem;
    // 650 000 - 95 000 selling costs = 555 000 net; cost basis 475 000; profit 80 000.
    expect(sold).toMatchObject({
      status: 'SOLD',
      holding: false,
      daysHeld: 8,
      sale: { price: ZAR(650_000), soldAt, marketplace: 'ebay' },
      result: { status: 'ok', costBasis: ZAR(475_000), netProceeds: ZAR(555_000), realizedProfit: ZAR(80_000), marginPercent: 12, returnPercent: 16 },
      comparison: {
        salePrice: { expected: ZAR(600_000), actual: ZAR(650_000), difference: ZAR(50_000) },
        // Realized profit below the (fee-free) estimated upside is a comparison, not a loss.
        profit: { expected: ZAR(185_000), actual: ZAR(80_000), difference: ZAR(-105_000) },
      },
    });
    expect(sold.sale!.costs).toHaveLength(3);
    // Purchase costs stay on the item; selling costs live on the sale only.
    expect(await prisma.cost.count({ where: { inventoryItemId: estimatedId } })).toBe(2);
    expect(await prisma.cost.count({ where: { inventoryItemId: estimatedId, saleId: { not: null } } })).toBe(0);

    // Correcting the sale replaces it (and its costs).
    const fixed = (await sale({ price: ZAR(640_000), soldAt, costs: [{ category: 'MARKETPLACE_FEE', amount: ZAR(64_000) }] }).expect(200)).body as InventoryItem;
    expect(fixed.result).toMatchObject({ realizedProfit: ZAR(101_000) });
    expect(fixed.sale).toMatchObject({ marketplace: null, costs: [{ category: 'MARKETPLACE_FEE' }] });
    expect(await prisma.sale.count({ where: { inventoryItemId: estimatedId } })).toBe(1);

    // A sold item's status only changes by undoing the sale.
    await as(request(server()).patch(`/inventory/${estimatedId}`)).send({ status: 'LISTED' }).expect(409);
    await as(request(server()).patch(`/inventory/${estimatedId}`)).send({ purchasedAt: new Date(Date.now() - DAY).toISOString() }).expect(400);
  });

  it('records a realized loss when costs exceed the sale', async () => {
    const id = await buy(deal.loss, { purchasedAt: new Date(Date.now() - 3 * DAY).toISOString(), costs: [{ category: 'REPAIR', amount: ZAR(40_000) }] });
    const sold = (await as(request(server()).put(`/inventory/${id}/sale`))
      .send({ price: ZAR(320_000), soldAt: new Date().toISOString(), costs: [{ category: 'MARKETPLACE_FEE', amount: ZAR(32_000) }] })
      .expect(200)).body as InventoryItem;
    expect(sold.result).toMatchObject({ status: 'ok', costBasis: ZAR(340_000), netProceeds: ZAR(288_000), realizedProfit: ZAR(-52_000) });
    expect(sold.comparison.profit).toEqual({ expected: null, actual: ZAR(-52_000), difference: null });
  });

  it('undoing a sale returns the item to holding with no result; purchase costs are kept', async () => {
    const undone = (await as(request(server()).delete(`/inventory/${estimatedId}/sale`)).expect(200)).body as InventoryItem;
    expect(undone).toMatchObject({ status: 'IN_STOCK', holding: true, sale: null, result: null, purchase: { total: ZAR(475_000) } });
    expect(await prisma.cost.count({ where: { userId, saleId: null, inventoryItemId: estimatedId } })).toBe(2);
    await as(request(server()).delete(`/inventory/${estimatedId}/sale`)).expect(200); // idempotent
  });

  it('corrects the purchase and replaces purchase costs; the expected snapshot never changes', async () => {
    const patched = (await as(request(server()).patch(`/inventory/${estimatedId}`)).send({ purchasePrice: ZAR(380_000), status: 'LISTED', notes: 'Negotiated down' }).expect(200)).body as InventoryItem;
    expect(patched).toMatchObject({
      status: 'LISTED',
      holding: true,
      notes: 'Negotiated down',
      purchase: { price: ZAR(380_000), total: ZAR(455_000) },
      expected: { askingPrice: ZAR(400_000) },
      comparison: { purchasePrice: { expected: ZAR(400_000), actual: ZAR(380_000), difference: ZAR(-20_000) } },
    });
    await as(request(server()).patch(`/inventory/${estimatedId}`)).send({}).expect(400);
    await as(request(server()).patch(`/inventory/${estimatedId}`)).send({ purchasePrice: USD(100) }).expect(400); // costs are in ZAR
    await as(request(server()).patch(`/inventory/${estimatedId}`)).send({ purchasedAt: new Date(Date.now() + DAY).toISOString() }).expect(400);

    await as(request(server()).put(`/inventory/${estimatedId}/purchase-costs`)).send({ costs: [{ category: 'TAX', amount: USD(1) }] }).expect(400);
    await as(request(server()).put(`/inventory/${estimatedId}/purchase-costs`)).send({ costs: [{ category: 'MARKETPLACE_FEE', amount: ZAR(1) }] }).expect(400);
    const replaced = (await as(request(server()).put(`/inventory/${estimatedId}/purchase-costs`)).send({ costs: [{ category: 'SUPPLIES', amount: ZAR(5_000) }] }).expect(200)).body as InventoryItem;
    expect(replaced.purchase).toMatchObject({ costs: [{ category: 'SUPPLIES' }], total: ZAR(385_000) });
  });

  it('lists holding / sold / all; a deal that was never bought is not in the ledger', async () => {
    await as(request(server()).post(`/deals/${deal.ignored}/ignore`)).send({}).expect(200);
    const holding = await list();
    expect(holding.items.map((i) => i.dealId).sort()).toEqual([deal.estimated, deal.plain].sort());
    expect((await list('?status=sold')).items.map((i) => i.dealId)).toEqual([deal.loss]);
    const all = await list('?status=all');
    expect(all.items).toHaveLength(3);
    expect(all.items.map((i) => i.dealId)).not.toContain(deal.ignored);
    expect(await prisma.inventoryItem.count({ where: { huntMatchId: deal.ignored } })).toBe(0);

    // Newest purchase first, with a cursor.
    const first = await list('?status=all&limit=2');
    expect(first.items).toHaveLength(2);
    const second = await list(`?status=all&limit=2&cursor=${first.nextCursor}`);
    expect([...first.items, ...second.items].map((i) => i.id)).toEqual(all.items.map((i) => i.id));
    expect(second.nextCursor).toBeNull();
  });

  it("another user's items are 404", async () => {
    await as(request(server()).get(`/inventory/${estimatedId}`), OTHER).expect(404);
    await as(request(server()).put(`/inventory/${estimatedId}/sale`), OTHER).send({ price: ZAR(1), soldAt: new Date().toISOString() }).expect(404);
    expect((await list()).items.length).toBeGreaterThan(0);
    expect((await as(request(server()).get('/inventory?status=all'), OTHER).expect(200)).body.items).toEqual([]);
  });
});
