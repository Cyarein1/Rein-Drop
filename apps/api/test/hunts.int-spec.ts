/**
 * Integration test against a REAL PostgreSQL (the local Docker database by default).
 * Not part of `pnpm test`; run with `pnpm --filter api test:int` after `pnpm infra:up`,
 * `pnpm db:migrate` and `pnpm db:seed`. Creates a throwaway user and deletes it afterwards.
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
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;

describe('Hunts (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, SUBJECT);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = await prisma.user.create({
      data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT },
    });
    userId = user.id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (userId) await prisma.user.delete({ where: { id: userId } }); // cascades to hunts + events
    await prisma.$disconnect();
  });

  it('runs the full lifecycle, preserving identity and history', async () => {
    const server = app.getHttpServer();

    // Create -> DRAFT (Facebook without a location is fine for a draft).
    const created = await as(request(server).post('/hunts'))
      .send({
        query: 'Nintendo Switch OLED',
        marketplaces: ['facebook', 'ebay'],
        maxPrice: { amountMinor: 200_00, currency: 'USD' },
        exclusions: ['broken'],
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ status: 'DRAFT', name: 'Nintendo Switch OLED', priority: 'NORMAL' });

    // Cannot go live on Facebook without a location.
    const notReady = await as(request(server).post(`/hunts/${id}/activate`)).expect(409);
    expect(notReady.body.details[0].path).toBe('body.location');

    // Edit keeps the id; dropping eBay disables (not deletes) the link.
    const edited = await as(request(server).patch(`/hunts/${id}`))
      .send({ location: { text: 'Cape Town', radiusKm: 40 }, marketplaces: ['facebook'] })
      .expect(200);
    expect(edited.body).toMatchObject({ id, marketplaces: ['facebook'], location: { text: 'Cape Town', radiusKm: 40 } });
    expect(edited.body.lastEditedAt).not.toBeNull();
    const links = await prisma.huntMarketplace.findMany({ where: { huntId: id } });
    expect(links).toHaveLength(2);
    expect(links.filter((l) => l.isEnabled)).toHaveLength(1);

    // Lifecycle.
    const live = await as(request(server).post(`/hunts/${id}/activate`)).expect(200);
    expect(live.body).toMatchObject({ status: 'LIVE' });
    expect(live.body.activatedAt).not.toBeNull();
    await as(request(server).post(`/hunts/${id}/activate`)).expect(409); // already live

    // A live hunt cannot be edited into a state that cannot run.
    await as(request(server).patch(`/hunts/${id}`)).send({ location: null }).expect(409);

    await as(request(server).post(`/hunts/${id}/pause`)).expect(200);
    await as(request(server).post(`/hunts/${id}/resume`)).expect(200);
    const archived = await as(request(server).post(`/hunts/${id}/archive`)).expect(200);
    expect(archived.body).toMatchObject({ id, status: 'ARCHIVED' });
    expect(archived.body.archivedAt).not.toBeNull();

    // Archived: kept, read-only, hidden from the default list.
    await as(request(server).patch(`/hunts/${id}`)).send({ name: 'Nope' }).expect(409);
    await as(request(server).post(`/hunts/${id}/resume`)).expect(409);
    expect((await as(request(server).get(`/hunts/${id}`)).expect(200)).body.status).toBe('ARCHIVED');
    const defaultList = await as(request(server).get('/hunts')).expect(200);
    expect(defaultList.body.items.map((h: { id: string }) => h.id)).not.toContain(id);
    const archivedList = await as(request(server).get('/hunts?status=ARCHIVED')).expect(200);
    expect(archivedList.body.items.map((h: { id: string }) => h.id)).toContain(id);

    // Full history, oldest first.
    const events = await as(request(server).get(`/hunts/${id}/events`)).expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      'CREATED',
      'EDITED',
      'ACTIVATED',
      'PAUSED',
      'RESUMED',
      'ARCHIVED',
    ]);
    expect(Object.keys(events.body.items[1].changes).sort()).toEqual(['location', 'marketplaces']);
    expect(await prisma.hunt.count({ where: { id } })).toBe(1);
  });

  it('paginates newest first with a cursor', async () => {
    const server = app.getHttpServer();
    for (const q of ['ps5 slim', 'xbox series x', 'steam deck']) {
      await as(request(server).post('/hunts')).send({ query: q, marketplaces: ['ebay'] }).expect(201);
    }
    const first = await as(request(server).get('/hunts?limit=2')).expect(200);
    expect(first.body.items.map((h: { query: string }) => h.query)).toEqual(['steam deck', 'xbox series x']);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await as(request(server).get(`/hunts?limit=2&cursor=${first.body.nextCursor}`)).expect(200);
    expect(second.body.items.map((h: { query: string }) => h.query)).toEqual(['ps5 slim']);
    expect(second.body.nextCursor).toBeNull();
  });

  it("does not expose another user's hunts", async () => {
    const other = await prisma.user.create({ data: { email: `${SUBJECT}-other@reindrop.test` } });
    try {
      const hunt = await prisma.hunt.create({ data: { userId: other.id, name: 'Theirs', query: 'theirs' } });
      await as(request(app.getHttpServer()).get(`/hunts/${hunt.id}`)).expect(404);
      await as(request(app.getHttpServer()).post(`/hunts/${hunt.id}/archive`)).expect(404);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
