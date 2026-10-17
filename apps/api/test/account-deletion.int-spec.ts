/**
 * Account deletion (Apple 5.1.1(v), Google Play, GDPR - decision 0021) against a REAL PostgreSQL
 * and a fake Stripe: the subscription is cancelled at Stripe first and the customer deleted; the
 * account and everything personal is erased (cascade), own photos removed from media storage;
 * shared marketplace listings and billing events (no personal data) stay. A Stripe failure deletes
 * nothing; a wrong confirmation, a suspended account and a signed-out caller are refused.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type InventoryItem, type SellListing } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { BILLING_PROVIDER } from './../src/modules/billing/billing-provider.js';
import { fakeStripe, PRICES } from './../src/modules/billing/fake-stripe.test-helper.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'rd-media-del-'));
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const NOW_S = Math.floor(Date.now() / 1000);
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

describe('Account deletion (integration, real database, fake Stripe)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ebayId: string;
  const stripe = fakeStripe();
  const users: string[] = [];
  const listings: string[] = [];
  const events: string[] = [];
  let n = 0;

  async function account() {
    const subject = `int-del-${RUN}-${++n}`;
    const userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    users.push(userId);
    const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, subject);
    const http = () => request(app.getHttpServer());
    return {
      userId,
      get: (p: string) => as(http().get(p)),
      post: (p: string, body: object = {}) => as(http().post(p)).send(body),
      upload: (p: string) => as(http().post(p)).attach('photo', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' }),
    };
  }

  /** Data in every area: hunt, deal bought from a shared listing, sale listing with an own photo, push device. */
  async function fill(a: Awaited<ReturnType<typeof account>>) {
    const listing = await prisma.listing.create({
      data: { marketplaceId: ebayId, externalId: `del-${RUN}-${++n}`, url: `https://dev.example/ebay/del-${RUN}-${n}`, title: 'Desk lamp', priceMinor: 100_00, currency: 'ZAR', status: 'ACTIVE', imageUrls: [] },
    });
    listings.push(listing.id);
    const hunt = await prisma.hunt.create({ data: { userId: a.userId, name: 'Lamps', query: 'desk lamp', status: 'PAUSED' } });
    const match = await prisma.huntMatch.create({ data: { huntId: hunt.id, listingId: listing.id, status: 'SEEN', relevanceScore: 100, reasons: [] } });
    const itemId = (await a.post(`/deals/${match.id}/bought`, {}).expect(200)).body.decision.inventoryItemId as string;
    const sell = (await a.post('/sell/listings', { inventoryItemId: itemId }).expect(200)).body as SellListing;
    await a.upload(`/sell/listings/${sell.id}/photos`).expect(201);
    await prisma.pushDevice.create({ data: { userId: a.userId, provider: 'dev_simulated', token: `dev-sim-del-${RUN}-${n}`, platform: 'android' } });
    const manual = (await a.post('/inventory', { title: 'Lamp', purchasePrice: ZAR(10_00), purchasedAt: new Date().toISOString() }).expect(201)).body as InventoryItem;
    return { listingId: listing.id, itemId, manualId: manual.id };
  }

  /** A Stripe customer with an active paid subscription, as checkout + webhook would leave it. */
  async function subscribe(userId: string) {
    const customerId = `cus_del_${RUN}_${++n}`;
    const subId = `sub_del_${RUN}_${n}`;
    stripe.customers.set(customerId, { id: customerId, email: 'x@reindrop.test', metadata: { reindrop_user_id: userId } });
    stripe.subscriptions.set(subId, { id: subId, customer: customerId, status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + 30 * 86_400, metadata: { reindrop_user_id: userId } });
    await prisma.billingCustomer.create({ data: { userId, provider: 'stripe', providerCustomerId: customerId } });
    const pro = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    await prisma.subscription.create({ data: { userId, planId: pro.id, status: 'ACTIVE', provider: 'stripe', providerSubscriptionId: subId, providerPriceId: PRICES.pro } });
    const evt = await prisma.billingEvent.create({ data: { provider: 'stripe', providerEventId: `evt_del_${RUN}_${n}`, type: 'customer.subscription.created', status: 'PROCESSED', subjectId: subId } });
    events.push(evt.id);
    return { customerId, subId, eventId: evt.id };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    ebayId = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    const config = loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      MEDIA_DIR,
      BILLING_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_unused_by_the_fake',
      STRIPE_PRICE_IDS: `pro=${PRICES.pro},ultimate=${PRICES.ultimate}`,
      WEB_APP_URL: 'http://localhost:3000',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).overrideProvider(BILLING_PROVIDER).useValue(stripe.provider).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.listing.deleteMany({ where: { id: { in: listings } } });
    await prisma.billingEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.$disconnect();
    rmSync(MEDIA_DIR, { recursive: true, force: true });
  });

  it('cancels the Stripe subscription, deletes the customer, erases the account and its data; shared and anonymous rows stay', async () => {
    const a = await account();
    const other = await account();
    const otherData = await fill(other);
    const data = await fill(a);
    const billing = await subscribe(a.userId);
    const photosBefore = readdirSync(MEDIA_DIR, { recursive: true }).length;
    expect(photosBefore).toBeGreaterThan(0);

    const res = await a.post('/me/delete', { confirmation: 'DELETE' }).expect(200);
    expect(res.body).toMatchObject({ deleted: true, canceledSubscriptions: 1, signOut: true });

    // Stripe: subscription cancelled now, customer deleted.
    expect(stripe.subscriptions.get(billing.subId)?.status).toBe('canceled');
    expect(stripe.customers.has(billing.customerId)).toBe(false);
    // Rein Drop: the account and everything personal is gone.
    expect(await prisma.user.findUnique({ where: { id: a.userId } })).toBeNull();
    for (const count of [
      prisma.hunt.count({ where: { userId: a.userId } }),
      prisma.inventoryItem.count({ where: { userId: a.userId } }),
      prisma.inventoryEvent.count({ where: { userId: a.userId } }),
      prisma.sellListing.count({ where: { userId: a.userId } }),
      prisma.pushDevice.count({ where: { userId: a.userId } }),
      prisma.subscription.count({ where: { userId: a.userId } }),
      prisma.billingCustomer.count({ where: { userId: a.userId } }),
    ]) {
      expect(await count).toBe(0);
    }
    // Kept: the shared marketplace listing and the billing event (no personal data in either).
    expect(await prisma.listing.findUnique({ where: { id: data.listingId } })).not.toBeNull();
    expect(await prisma.billingEvent.findUnique({ where: { id: billing.eventId } })).not.toBeNull();
    // Own photos removed from media storage (the other account's stay).
    expect(readdirSync(MEDIA_DIR, { recursive: true }).filter((f) => existsSync(path.join(MEDIA_DIR, String(f)))).length).toBeLessThan(photosBefore);
    // The other account is untouched.
    await other.get(`/inventory/${otherData.itemId}`).expect(200);

    // Signed out: the old session belongs to no account any more.
    await a.get('/me').expect(401);
    await a.post('/me/delete', { confirmation: 'DELETE' }).expect(401);
  });

  it('a Stripe failure deletes nothing (503, try again)', async () => {
    const a = await account();
    await fill(a);
    await subscribe(a.userId);
    stripe.failNextRequest();
    await a.post('/me/delete', { confirmation: 'DELETE' }).expect(503);
    expect(await prisma.user.findUnique({ where: { id: a.userId } })).not.toBeNull();
    expect(await prisma.inventoryItem.count({ where: { userId: a.userId } })).toBe(2);
  });

  it('needs the exact confirmation, a signed-in caller and an account that is not suspended', async () => {
    const a = await account();
    await a.post('/me/delete', {}).expect(400);
    await a.post('/me/delete', { confirmation: 'delete' }).expect(400);
    await request(app.getHttpServer()).post('/me/delete').send({ confirmation: 'DELETE' }).expect(401);
    await prisma.user.update({ where: { id: a.userId }, data: { accessSuspendedAt: new Date(), accessSuspendedReason: 'chargeback test' } });
    const refused = await a.post('/me/delete', { confirmation: 'DELETE' }).expect(403);
    expect(refused.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(await prisma.user.findUnique({ where: { id: a.userId } })).not.toBeNull();
  });

  it('without a Stripe customer there is nothing to cancel', async () => {
    const a = await account();
    const res = await a.post('/me/delete', { confirmation: 'DELETE' }).expect(200);
    expect(res.body.canceledSubscriptions).toBe(0);
  });
});
