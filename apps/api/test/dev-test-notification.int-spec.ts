/**
 * DEVELOPMENT ONLY test push (step 84): POST /dev/notifications/test writes an alert with a PENDING
 * push for the worker's outbox, pointing at the caller's latest deal (or the inbox). Real database;
 * throwaway user, deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;

describe('dev test notification (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let listingId: string;
  const subject = `int-testpush-${randomUUID().slice(0, 8)}`;
  const post = () => request(app.getHttpServer()).post('/dev/notifications/test').set(DEV_AUTH_HEADER, subject).send({});

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.user.deleteMany({ where: { id: userId } });
    if (listingId) await prisma.listing.deleteMany({ where: { id: listingId } });
    await prisma.$disconnect();
  });

  it('without deals: an alert whose push opens the inbox, queued for the worker', async () => {
    const res = await post().expect(200);
    expect(res.body.dealId).toBeNull();
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: res.body.alertId }, include: { deliveries: true } });
    expect(alert).toMatchObject({ userId, category: 'operational', huntMatchId: null, body: 'Tap to open your inbox.' });
    expect(alert.deliveries.map((d) => [d.channel, d.status]).sort()).toEqual([
      ['IN_APP', 'SENT'],
      ['PUSH', 'PENDING'],
    ]);
  });

  it('with deals: it points at the latest one, so tapping it tests the deep link', async () => {
    const ebay = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    const hunt = await prisma.hunt.create({ data: { userId, name: 'Test', query: 'iPhone', status: 'PAUSED', priceCurrency: 'ZAR' } });
    const listing = await prisma.listing.create({ data: { marketplaceId: ebay, externalId: `testpush-${randomUUID()}`, url: 'https://dev.example/x', title: 'iPhone 13 128GB', priceMinor: 1, currency: 'ZAR', status: 'ACTIVE', imageUrls: [] } });
    listingId = listing.id;
    const match = await prisma.huntMatch.create({ data: { huntId: hunt.id, listingId: listing.id, status: 'NEW', relevanceScore: 100, reasons: [] } });
    const res = await post().expect(200);
    expect(res.body.dealId).toBe(match.id);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: res.body.alertId } })).body).toBe('Tap to open "iPhone 13 128GB".');
  });
});
