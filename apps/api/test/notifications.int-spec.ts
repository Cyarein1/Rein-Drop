/**
 * Notification preferences, the in-app inbox and the development delivery log against a REAL
 * PostgreSQL. Alerts are inserted directly (the worker creates them in production code - see
 * apps/worker/test/alerts.int-spec.ts). Throwaway users, deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type AlertPage, type NotificationLog, type NotificationPreferences } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const OTHER = `int-test-${randomUUID().slice(0, 8)}`;

describe('Notifications (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let otherId: string;
  const alertIds: string[] = [];
  const as = (req: request.Test, subject = SUBJECT) => req.set(DEV_AUTH_HEADER, subject);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (subject: string) => prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } });
    userId = (await user(SUBJECT)).id;
    otherId = (await user(OTHER)).id;
    for (const [i, category] of (['deal_alerts', 'exceptional_deals', 'deal_alerts'] as const).entries()) {
      const alert = await prisma.alert.create({
        data: {
          userId,
          category,
          dedupeKey: `int-test:${randomUUID()}`,
          title: `Alert ${i}`,
          body: 'body',
          deliveries: {
            create: [
              { channel: 'IN_APP', status: 'SENT', provider: 'in_app', sentAt: new Date() },
              { channel: 'PUSH', status: 'SIMULATED', provider: 'simulator', attempts: 1, sentAt: new Date() },
              { channel: 'EMAIL', status: 'SKIPPED', reason: 'disabled_by_preference' },
            ],
          },
        },
      });
      alertIds.push(alert.id);
    }
    await prisma.alert.create({ data: { userId: otherId, category: 'deal_alerts', dedupeKey: `int-test:${randomUUID()}`, title: 'Not yours' } });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [userId, otherId]) if (id) await prisma.user.delete({ where: { id } }); // alerts, deliveries, preferences
    await prisma.$disconnect();
  });

  it('preferences: defaults until changed; marketing is separate and opt-in; service alerts keep the inbox', async () => {
    const prefs = (await as(request(server()).get('/me/notification-preferences')).expect(200)).body as NotificationPreferences;
    const of = (c: string) => prefs.categories.find((x) => x.category === c)!;
    expect(of('deal_alerts')).toMatchObject({ group: 'alerts', channels: { IN_APP: { enabled: true, editable: false }, PUSH: { enabled: true }, EMAIL: { enabled: false } } });
    expect(of('marketing')).toMatchObject({ group: 'marketing', channels: { IN_APP: { available: false }, PUSH: { enabled: false }, EMAIL: { enabled: false } } });
    expect(await prisma.notificationPreference.count({ where: { userId } })).toBe(0); // nothing stored until changed

    const updated = (
      await as(request(server()).patch('/me/notification-preferences'))
        .send({ changes: [{ category: 'deal_alerts', channel: 'PUSH', enabled: false }, { category: 'marketing', channel: 'EMAIL', enabled: true }] })
        .expect(200)
    ).body as NotificationPreferences;
    expect(updated.categories.find((c) => c.category === 'deal_alerts')!.channels.PUSH.enabled).toBe(false);
    expect(updated.categories.find((c) => c.category === 'marketing')!.channels.EMAIL.enabled).toBe(true);
    // Marketing consent didn't touch service alerts.
    expect(updated.categories.find((c) => c.category === 'exceptional_deals')!.channels.EMAIL.enabled).toBe(false);
    // Another user is unaffected.
    const other = (await as(request(server()).get('/me/notification-preferences'), OTHER).expect(200)).body as NotificationPreferences;
    expect(other.categories.find((c) => c.category === 'deal_alerts')!.channels.PUSH.enabled).toBe(true);
  });

  it('inbox: newest first with an unread count, paged, only your own', async () => {
    const page = (await as(request(server()).get('/alerts')).expect(200)).body as AlertPage;
    expect(page.items.map((a) => a.title)).toEqual(['Alert 2', 'Alert 1', 'Alert 0']);
    expect(page.unreadCount).toBe(3);
    expect(page.items.some((a) => a.title === 'Not yours')).toBe(false);
    const first = (await as(request(server()).get('/alerts?limit=2')).expect(200)).body as AlertPage;
    const second = (await as(request(server()).get(`/alerts?limit=2&cursor=${first.nextCursor}`)).expect(200)).body as AlertPage;
    expect([...first.items, ...second.items].map((a) => a.title)).toEqual(['Alert 2', 'Alert 1', 'Alert 0']);
    expect(second.nextCursor).toBeNull();
  });

  it('read one (idempotent), read all, unread filter; another user\'s alert is 404', async () => {
    const read = await as(request(server()).post(`/alerts/${alertIds[0]}/read`)).expect(200);
    expect(read.body.readAt).not.toBeNull();
    const again = await as(request(server()).post(`/alerts/${alertIds[0]}/read`)).expect(200);
    expect(again.body.readAt).toBe(read.body.readAt);
    const unread = (await as(request(server()).get('/alerts?unreadOnly=true')).expect(200)).body as AlertPage;
    expect(unread).toMatchObject({ unreadCount: 2 });
    expect(unread.items).toHaveLength(2);

    const notYours = await prisma.alert.findFirstOrThrow({ where: { userId: otherId } });
    await as(request(server()).post(`/alerts/${notYours.id}/read`)).expect(404);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: notYours.id } })).readAt).toBeNull();

    expect((await as(request(server()).post('/alerts/read-all')).expect(200)).body).toEqual({ updated: 2 });
    expect(((await as(request(server()).get('/alerts')).expect(200)).body as AlertPage).unreadCount).toBe(0);
  });

  it('development log: every delivery with its channel, status and reason', async () => {
    const log = (await as(request(server()).get('/dev/notifications')).expect(200)).body as NotificationLog;
    expect(log.items).toHaveLength(9);
    expect(new Set(log.items.map((d) => `${d.channel}:${d.status}`))).toEqual(new Set(['IN_APP:SENT', 'PUSH:SIMULATED', 'EMAIL:SKIPPED']));
    expect(log.items.find((d) => d.channel === 'EMAIL')!.reason).toBe('disabled_by_preference');
    expect(((await as(request(server()).get('/dev/notifications'), OTHER).expect(200)).body as NotificationLog).items).toHaveLength(0);
  });

  it('push devices: register, refresh by token, move between accounts, unregister', async () => {
    const token = `ExponentPushToken[int-test-${randomUUID().slice(0, 8)}]`;
    const first = await as(request(server()).post('/me/push-devices')).send({ provider: 'expo', token, platform: 'ios', deviceName: 'iPhone 15' }).expect(200);
    expect(first.body).toMatchObject({ provider: 'expo', platform: 'ios', deviceName: 'iPhone 15', active: true, disabledReason: null });
    // Refresh (app launch): same row, newer lastSeenAt.
    const again = await as(request(server()).post('/me/push-devices')).send({ provider: 'expo', token, platform: 'ios', deviceName: 'iPhone 15' }).expect(200);
    expect(again.body.id).toBe(first.body.id);
    expect(Date.parse(again.body.lastSeenAt)).toBeGreaterThanOrEqual(Date.parse(first.body.lastSeenAt));
    expect((await as(request(server()).get('/me/push-devices')).expect(200)).body.items).toHaveLength(1);

    // Unregister: kept, inactive; someone else can't touch it.
    await as(request(server()).delete(`/me/push-devices/${first.body.id}`), OTHER).expect(404);
    const off = await as(request(server()).delete(`/me/push-devices/${first.body.id}`)).expect(200);
    expect(off.body).toMatchObject({ active: false, disabledReason: 'unregistered' });

    // The same phone signs into another account: the token moves and is active again.
    const moved = await as(request(server()).post('/me/push-devices'), OTHER).send({ provider: 'expo', token, platform: 'ios' }).expect(200);
    expect(moved.body).toMatchObject({ id: first.body.id, active: true });
    expect((await as(request(server()).get('/me/push-devices')).expect(200)).body.items).toHaveLength(0);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token } })).userId).toBe(otherId);

    // Development token from Expo Go (allowed outside production).
    await as(request(server()).post('/me/push-devices')).send({ provider: 'dev_simulated', token: `dev-simulated:${randomUUID()}`, platform: 'android' }).expect(200);
  });
});
