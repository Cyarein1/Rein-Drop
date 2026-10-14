/**
 * Places, "Your area" and Hunt coordinates (decision 0017) against a REAL PostgreSQL with the
 * development (mock) geocoder. Run with `pnpm --filter api test:int` after migrate + seed.
 * Creates a throwaway user and deletes it afterwards.
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
const SUBJECT = `int-geo-${randomUUID().slice(0, 8)}`;

describe('Geo (integration, real database, mock geocoder)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, SUBJECT);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = await prisma.user.create({
      data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT, countryCode: 'ZA', currency: 'ZAR', distanceUnit: 'km', language: 'en', regionSource: 'user' },
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
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('reports the mock geocoder with development map tiles', async () => {
    const res = await as(request(app.getHttpServer()).get('/geo/config')).expect(200);
    expect(res.body).toEqual({ provider: 'mock', suggestions: true, tiles: 'osm', attribution: '© OpenStreetMap contributors' });
  });

  it('suggests places in the user country first; validates the query; needs sign-in', async () => {
    const server = app.getHttpServer();
    const res = await as(request(server).get('/geo/suggest').query({ q: 'san' })).expect(200);
    expect(res.body.places[0]).toEqual({ label: 'Sandton, Johannesburg, Gauteng', point: { lat: -26.108, lng: 28.057 }, postalCode: '2196', countryCode: 'ZA' });
    await as(request(server).get('/geo/suggest').query({ q: 'x' })).expect(400);
    await request(server).get('/geo/suggest').query({ q: 'sandton' }).expect(401);
  });

  it('saves, reads and clears "Your area" (picked point, typed text placed, unknown text kept)', async () => {
    const server = app.getHttpServer();
    expect((await as(request(server).get('/me/area')).expect(200)).body).toEqual({ area: null });

    const picked = await as(request(server).put('/me/area')).send({ label: 'Sandton, Johannesburg, Gauteng', point: { lat: -26.107612, lng: 28.056749 }, postalCode: '2196' }).expect(200);
    expect(picked.body.area).toMatchObject({ label: 'Sandton, Johannesburg, Gauteng', point: { lat: -26.108, lng: 28.057 }, postalCode: '2196' });

    const typed = await as(request(server).put('/me/area')).send({ label: 'Rosebank' }).expect(200);
    expect(typed.body.area).toMatchObject({ label: 'Rosebank', point: { lat: -26.146, lng: 28.041 }, postalCode: null });

    const unknown = await as(request(server).put('/me/area')).send({ label: 'Nowhere Special' }).expect(200);
    expect(unknown.body.area).toMatchObject({ label: 'Nowhere Special', point: null });

    await as(request(server).put('/me/area')).send({ label: 'x' }).expect(400);
    await as(request(server).put('/me/area')).send({ label: 'Sandton', point: { lat: 120, lng: 0 } }).expect(400);

    expect((await as(request(server).delete('/me/area')).expect(200)).body).toEqual({ area: null });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([row.areaLabel, row.areaLat, row.areaLng]).toEqual([null, null, null]);
  });

  it('stores Hunt coordinates: the picked point, else the text placed on save, else none', async () => {
    const server = app.getHttpServer();
    const picked = await as(request(server).post('/hunts'))
      .send({ query: 'iPhone 13', marketplaces: ['facebook'], location: { text: 'Sandton', radiusKm: 25, point: { lat: -26.1076, lng: 28.0567 } } })
      .expect(201);
    expect(picked.body.location).toEqual({ text: 'Sandton', radiusKm: 25, point: { lat: -26.108, lng: 28.057 } });

    const typed = await as(request(server).post('/hunts')).send({ query: 'PS5', marketplaces: ['facebook'], location: { text: 'Cape Town', radiusKm: 40 } }).expect(201);
    expect(typed.body.location).toEqual({ text: 'Cape Town', radiusKm: 40, point: { lat: -33.925, lng: 18.424 } });

    const unknown = await as(request(server).post('/hunts')).send({ query: 'Switch', marketplaces: ['facebook'], location: { text: 'Nowhere Special', radiusKm: 10 } }).expect(201);
    expect(unknown.body.location.point).toBeNull();

    // Editing the text re-places it; the point is recorded in the edit history.
    const edited = await as(request(server).patch(`/hunts/${typed.body.id}`)).send({ location: { text: 'Durban', radiusKm: 40 } }).expect(200);
    expect(edited.body.location.point).toEqual({ lat: -29.859, lng: 31.022 });
    const events = await as(request(server).get(`/hunts/${typed.body.id}/events`)).expect(200);
    const edit = events.body.items.find((e: { type: string }) => e.type === 'EDITED');
    expect(edit.changes.location.after.point).toEqual({ lat: -29.859, lng: 31.022 });
  });
});
