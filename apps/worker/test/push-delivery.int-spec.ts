/**
 * Push delivery rules on a REAL PostgreSQL (step 84):
 * - access gate: sourcing pushes are skipped for suspended accounts, paused Hunts and Hunts above
 *   the plan's live limit (enforced at send time, not only by the 5-minute sweep) - the in-app
 *   alert stays;
 * - Expo tickets are stored and their receipts checked later; DeviceNotRegistered disables the device;
 * - devices silent for too long are disabled; payloads carry ids only.
 * Throwaway users; the Expo push service is a fake fetch; everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_ACCESS_POLICY } from '@rein-drop/access';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AccessAlertGate } from '../src/notifications/alert-gate.js';
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher.js';
import { ExpoPushProvider } from '../src/notifications/push/expo-push-provider.js';
import { PUSH_MAINTENANCE_DEFAULTS, PushMaintenance } from '../src/notifications/push/push-maintenance.js';
import { PushNotificationSender } from '../src/notifications/push/push-sender.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const NOW = new Date('2036-10-15T10:00:00Z');
const MIN = 60_000;

/** A fake Expo push service: remembers what was sent; receipts are scripted per ticket id. */
function fakeExpo() {
  const sent: { to: string; title: string; data: Record<string, string> }[] = [];
  const receipts: Record<string, { status: string; message?: string; details?: { error?: string } }> = {};
  const fetch = (async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const json = url.endsWith('/getReceipts')
      ? { data: Object.fromEntries((body.ids as string[]).filter((id) => receipts[id]).map((id) => [id, receipts[id]])) }
      : { data: (body as { to: string; title: string; data: Record<string, string> }[]).map((m) => (sent.push(m), { status: 'ok', id: `ticket-${randomUUID()}` })) };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { sent, receipts, provider: new ExpoPushProvider({ fetch }) };
}

describe('push delivery: access gate, receipts, stale devices (integration, real database)', () => {
  let prisma: PrismaClient;
  let ebay: string;
  const users: string[] = [];
  const listings: string[] = [];

  /** An account with a LIVE Hunt, one phone, and one deal alert whose push is PENDING. */
  async function account(o: { hunts?: number; suspended?: boolean } = {}) {
    const subject = `int-push-${randomUUID().slice(0, 8)}`;
    const user = await prisma.user.create({
      data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject, ...(o.suspended ? { accessSuspendedAt: NOW, accessSuspendedReason: 'test' } : {}) },
    });
    users.push(user.id);
    const device = await prisma.pushDevice.create({ data: { userId: user.id, provider: 'expo', token: `ExponentPushToken[${randomUUID()}]`, platform: 'android', lastSeenAt: NOW } });
    const alerts: string[] = [];
    for (let i = 0; i < (o.hunts ?? 1); i++) {
      const hunt = await prisma.hunt.create({ data: { userId: user.id, name: `Hunt ${i}`, query: 'iPhone 13', status: 'LIVE', priceCurrency: 'ZAR', activatedAt: new Date(NOW.getTime() - (10 - i) * MIN) } });
      const listing = await prisma.listing.create({ data: { marketplaceId: ebay, externalId: `push-${randomUUID()}`, url: 'https://dev.example/ebay/x', title: 'iPhone 13', priceMinor: 100_000, currency: 'ZAR', status: 'ACTIVE', imageUrls: [] } });
      listings.push(listing.id);
      const match = await prisma.huntMatch.create({ data: { huntId: hunt.id, listingId: listing.id, status: 'NEW', relevanceScore: 100, reasons: [] } });
      const alert = await prisma.alert.create({
        data: {
          userId: user.id,
          category: 'deal_alerts',
          huntId: hunt.id,
          huntMatchId: match.id,
          dedupeKey: `deal:${match.id}`,
          title: 'Strong deal: iPhone 13',
          body: 'Well below recent sales',
          deliveries: { create: [{ channel: 'IN_APP', status: 'SENT' }, { channel: 'PUSH', status: 'PENDING' }] },
        },
      });
      alerts.push(alert.id);
    }
    const push = async (alertId: string) => prisma.notificationDelivery.findUniqueOrThrow({ where: { alertId_channel: { alertId, channel: 'PUSH' } } });
    return { userId: user.id, deviceId: device.id, alerts, push };
  }

  const dispatch = (expo: ReturnType<typeof fakeExpo>) =>
    new NotificationDispatcher(
      prisma,
      { PUSH: new PushNotificationSender(prisma, { expo: expo.provider }) },
      { batchSize: 100, leaseMs: 60_000, maxAttempts: 3 },
      () => NOW,
      new AccessAlertGate(prisma, DEFAULT_ACCESS_POLICY),
    ).dispatchPending();

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    ebay = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.listing.deleteMany({ where: { id: { in: listings } } });
    await prisma.$disconnect();
  });

  it('sends a deal push with ids only (no tokens, credentials or account data) and stores the ticket', async () => {
    const expo = fakeExpo();
    const a = await account();
    await dispatch(expo);
    expect((await a.push(a.alerts[0]!)).status).toBe('SENT');
    const message = expo.sent.find((m) => m.data.alertId === a.alerts[0]);
    expect(Object.keys(message!.data).sort()).toEqual(['alertId', 'category', 'dealId']);
    expect(JSON.stringify(message!.data)).not.toMatch(/@reindrop\.test|token|ExponentPushToken/i);
    expect(await prisma.pushTicket.count({ where: { pushDeviceId: a.deviceId } })).toBe(1);
  });

  it('suspended account: the push is skipped, the in-app alert stays', async () => {
    const a = await account({ suspended: true });
    await dispatch(fakeExpo());
    expect(await a.push(a.alerts[0]!)).toMatchObject({ status: 'SKIPPED', reason: 'account_suspended' });
    expect(await prisma.notificationDelivery.findUnique({ where: { alertId_channel: { alertId: a.alerts[0]!, channel: 'IN_APP' } } })).toMatchObject({ status: 'SENT' });
  });

  it('Hunt paused after the alert was written (waiting in the outbox): skipped', async () => {
    const a = await account();
    await prisma.hunt.updateMany({ where: { userId: a.userId }, data: { status: 'PAUSED' } });
    await dispatch(fakeExpo());
    expect(await a.push(a.alerts[0]!)).toMatchObject({ status: 'SKIPPED', reason: 'hunt_not_live' });
  });

  it('more live Hunts than the plan allows: the limit is enforced at send time, so only the allowed Hunt alerts', async () => {
    // Free (placeholder limit 1 live Hunt) with two LIVE Hunts - e.g. a paid period just ended.
    const a = await account({ hunts: 2 });
    await dispatch(fakeExpo());
    const statuses = await Promise.all(a.alerts.map(async (id) => (await a.push(id)).status));
    expect(statuses.sort()).toEqual(['SENT', 'SKIPPED']);
    expect(await prisma.hunt.count({ where: { userId: a.userId, status: 'LIVE' } })).toBe(1);
  });

  it('receipts: DeviceNotRegistered disables the device; not-ready receipts wait; no receipt after a day closes as unknown', async () => {
    const expo = fakeExpo();
    const gone = await account();
    const fine = await account();
    const late = await account();
    await dispatch(expo);
    const ticketOf = async (deviceId: string) => (await prisma.pushTicket.findFirstOrThrow({ where: { pushDeviceId: deviceId } })).ticketId;
    expo.receipts[await ticketOf(gone.deviceId)] = { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };
    expo.receipts[await ticketOf(fine.deviceId)] = { status: 'ok' };
    const maintenance = new PushMaintenance(prisma, { expo: expo.provider }, { ...PUSH_MAINTENANCE_DEFAULTS, staleDeviceDays: 90 });
    // Tickets carry the real time they were stored; the receipt clock is relative to that (lastSeenAt is far in the future, so nothing is stale here).
    const t0 = Date.now();

    // Too early: nothing is asked for yet.
    expect((await maintenance.run(new Date(t0 + 5 * MIN))).checked).toBe(0);
    const later = await maintenance.run(new Date(t0 + 20 * MIN));
    expect(later.disabledByReceipt).toBeGreaterThanOrEqual(1);
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { id: gone.deviceId } })).toMatchObject({ disabledReason: 'device_not_registered' });
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: fine.deviceId } })).disabledAt).toBeNull();
    expect((await prisma.pushTicket.findFirstOrThrow({ where: { pushDeviceId: late.deviceId } })).checkedAt).toBeNull();

    await maintenance.run(new Date(t0 + 25 * 60 * MIN));
    expect(await prisma.pushTicket.findFirstOrThrow({ where: { pushDeviceId: late.deviceId } })).toMatchObject({ receiptStatus: 'unknown' });
    // The disabled device gets nothing next time.
    expect((await new PushNotificationSender(prisma, { expo: fakeExpo().provider }).send({ deliveryId: randomUUID(), alertId: randomUUID(), channel: 'PUSH', category: 'deal_alerts', title: 't', body: null, dealId: null, recipient: { userId: gone.userId, email: 'x' } }).catch((e: Error) => e.message))).toBe('no_device');
  });

  it('devices silent for longer than the stale limit are disabled; a fresh registration is kept', async () => {
    const old = await account();
    const recent = await account();
    await prisma.pushDevice.update({ where: { id: old.deviceId }, data: { lastSeenAt: new Date(NOW.getTime() - 91 * 24 * 60 * MIN) } });
    await new PushMaintenance(prisma, {}, { ...PUSH_MAINTENANCE_DEFAULTS, staleDeviceDays: 90 }).run(NOW);
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { id: old.deviceId } })).toMatchObject({ disabledReason: 'stale' });
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: recent.deviceId } })).disabledAt).toBeNull();
  });
});
