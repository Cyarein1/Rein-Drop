/**
 * Alerts end to end on a REAL PostgreSQL: search -> match -> analysis -> alert (+ deliveries) ->
 * notification outbox -> simulated push / email. Checkpoint (Build Prompt 24): a strong eligible
 * deal creates one alert, and processing the same fixture again creates no duplicates.
 * Same isolation as the other worker integration tests (throwaway users, own queues, clock ten
 * years ahead - a running worker never claims these deliveries); everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { createMockAIProvider } from '@rein-drop/ai-core';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter } from '@rein-drop/marketplace-core/adapters';
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher.js';
import { ExpoPushProvider } from '../src/notifications/push/expo-push-provider.js';
import { PushNotificationSender } from '../src/notifications/push/push-sender.js';
import { SimulatedPushProvider } from '../src/notifications/push/simulated-push-provider.js';
import { SimulatedSender, type NotificationSender } from '../src/notifications/senders.js';
import { DealAnalysisHandler } from '../src/pipeline/deal-analysis.handler.js';
import { HuntScheduler } from '../src/pipeline/hunt-scheduler.js';
import { MarketplaceSearchHandler } from '../src/pipeline/marketplace-search.handler.js';
import { JobRunner } from '../src/queue/job-runner.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const INTERVAL = 15 * 60_000;
const DAY = 24 * 3_600_000;
const SEARCH_QUEUE = `int-test-search-${randomUUID()}`;
const ANALYSIS_QUEUE = `int-test-analysis-${randomUUID()}`;

describe('alerts and notification deliveries (integration, real database)', () => {
  let prisma: PrismaClient;
  let t = Date.parse('2036-10-07T10:00:00Z');
  const clock = () => new Date(t);
  const epoch = new Date(t);
  let market: Record<'ebay' | 'facebook', string>;
  /** Default preferences. */
  let alice: string;
  /** Push off, email on (deal alerts). */
  let bob: string;
  const hunts: string[] = [];

  const registry = () =>
    new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR' }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR' }), clock),
    ]);
  const drain = async (runner: JobRunner) => {
    let total = 0;
    for (let r = await runner.runOnce(); r.received > 0; r = await runner.runOnce()) total += r.received;
    return total;
  };
  /** One full worker pass: schedule due hunts, run searches, run analyses. */
  async function runWorker() {
    const queue = new PostgresJobQueue(prisma, clock);
    const scheduler = new HuntScheduler(prisma, queue, { pollIntervalMs: INTERVAL, maxAttempts: 3, batchSize: 50, queue: SEARCH_QUEUE, onlyUserIds: [alice, bob] }, clock);
    const search = new MarketplaceSearchHandler(prisma, registry(), { maxPages: 1, analysis: { queue, queueName: ANALYSIS_QUEUE, maxAttempts: 3 } }, clock);
    await scheduler.scheduleDue();
    await drain(new JobRunner(queue, [search], { queue: SEARCH_QUEUE, maxJobs: 10, leaseMs: 60_000 }, clock));
    const analysis = new DealAnalysisHandler(prisma, createMockAIProvider(), registry(), undefined, clock);
    await drain(new JobRunner(queue, [analysis], { queue: ANALYSIS_QUEUE, maxJobs: 50, leaseMs: 60_000 }, clock));
  }
  const alertsOf = (userId: string) => prisma.alert.findMany({ where: { userId }, include: { deliveries: true }, orderBy: { createdAt: 'asc' } });
  const dispatcher = (senders: { PUSH?: NotificationSender; EMAIL?: NotificationSender }, maxAttempts = 3) =>
    new NotificationDispatcher(prisma, senders, { batchSize: 100, leaseMs: 60_000, maxAttempts }, clock);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;
    const user = async () => {
      const subject = `int-test-${randomUUID().slice(0, 8)}`;
      return (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    };
    alice = await user();
    bob = await user();
    await prisma.notificationPreference.createMany({
      data: [
        { userId: bob, category: 'deal_alerts', channel: 'PUSH', enabled: false },
        { userId: bob, category: 'deal_alerts', channel: 'EMAIL', enabled: true },
        // Marketing consent must never change service alerts.
        { userId: bob, category: 'marketing', channel: 'PUSH', enabled: true },
      ],
    });
    for (const [userId, query] of [
      [alice, 'iPhone 13'],
      [bob, 'Galaxy S23'],
    ] as const) {
      const hunt = await prisma.hunt.create({
        data: {
          userId,
          name: query,
          query,
          status: 'LIVE',
          locationText: 'Cape Town',
          radiusKm: 40,
          maxPriceMinor: 1_500_000,
          priceCurrency: 'ZAR',
          targetProfitMinor: 100_000,
          // Due at the test clock only: a real worker running alongside never claims these hunts.
          marketplaces: { create: [{ marketplaceId: market.ebay, nextPollAt: epoch }, { marketplaceId: market.facebook, nextPollAt: epoch }] },
        },
      });
      hunts.push(hunt.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.dealAnalysis.deleteMany({ where: { huntMatch: { huntId: { in: hunts } } } });
      const runs = await prisma.searchRun.findMany({ where: { huntIds: { hasSome: hunts } }, select: { id: true } });
      const raws = await prisma.rawListing.findMany({ where: { searchRunId: { in: runs.map((r) => r.id) } }, select: { listingId: true } });
      await prisma.rawListing.deleteMany({ where: { searchRunId: { in: runs.map((r) => r.id) } } });
      await prisma.searchRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
      await prisma.job.deleteMany({ where: { queue: { in: [SEARCH_QUEUE, ANALYSIS_QUEUE] } } });
      for (const id of [alice, bob]) if (id) await prisma.user.delete({ where: { id } }); // hunts, matches, alerts, deliveries, prefs
      const listingIds = [...new Set(raws.map((r) => r.listingId).filter((id): id is string => id !== null))];
      await prisma.listing.deleteMany({ where: { id: { in: listingIds }, rawListings: { none: {} }, dealAnalyses: { none: {} } } });
      await prisma.$disconnect();
    }
  });

  it('an eligible deal creates exactly one alert, with in-app delivered and push queued', async () => {
    await runWorker();
    const eligible = await prisma.dealAnalysis.findMany({ where: { alertEligible: true, huntMatch: { huntId: hunts[0] } }, select: { huntMatchId: true } });
    expect(eligible.length).toBeGreaterThan(0);
    const alerts = await alertsOf(alice);
    expect(alerts.map((a) => a.huntMatchId).sort()).toEqual(eligible.map((e) => e.huntMatchId).sort());
    // Not every match alerts.
    expect(await prisma.huntMatch.count({ where: { huntId: hunts[0] } })).toBeGreaterThan(alerts.length);
    for (const alert of alerts) {
      expect(alert).toMatchObject({ category: 'deal_alerts', dedupeKey: `deal:${alert.huntMatchId}`, huntId: hunts[0], readAt: null });
      expect(alert.title).toMatch(/^Strong deal: /);
      expect(alert.dealAnalysisId).not.toBeNull();
      const byChannel = Object.fromEntries(alert.deliveries.map((d) => [d.channel, d]));
      expect(byChannel.IN_APP).toMatchObject({ status: 'SENT', provider: 'in_app' });
      expect(byChannel.PUSH).toMatchObject({ status: 'PENDING', attempts: 0 });
      expect(byChannel.EMAIL).toMatchObject({ status: 'SKIPPED', reason: 'disabled_by_preference' });
    }
  });

  it('respects preferences: push off -> skipped, email on -> queued; marketing consent changes nothing', async () => {
    const alerts = await alertsOf(bob);
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      const byChannel = Object.fromEntries(alert.deliveries.map((d) => [d.channel, d.status]));
      expect(byChannel).toEqual({ IN_APP: 'SENT', PUSH: 'SKIPPED', EMAIL: 'PENDING' });
    }
  });

  it('running the worker again on the same fixture creates no duplicate alerts - not even after re-analysis', async () => {
    const before = await prisma.alert.count({ where: { userId: { in: [alice, bob] } } });
    // Same window, jobs redelivered.
    await prisma.job.updateMany({ where: { queue: { in: [SEARCH_QUEUE, ANALYSIS_QUEUE] } }, data: { status: 'QUEUED', runAt: new Date(t) } });
    await runWorker();
    // Next polling window.
    t += INTERVAL;
    await runWorker();
    // Next day: "now" changes the input hash, so every open match is analysed again (new rows).
    const analysesBefore = await prisma.dealAnalysis.count({ where: { huntMatch: { huntId: { in: hunts } } } });
    t += DAY;
    await runWorker();
    expect(await prisma.dealAnalysis.count({ where: { huntMatch: { huntId: { in: hunts } } } })).toBeGreaterThan(analysesBefore);
    expect(await prisma.alert.count({ where: { userId: { in: [alice, bob] } } })).toBe(before);
  });

  it('the outbox delivers each pending push / email once through the simulator', async () => {
    const pending = await prisma.notificationDelivery.count({ where: { status: 'PENDING', alert: { userId: { in: [alice, bob] } } } });
    expect(pending).toBeGreaterThan(0);
    const push = new SimulatedSender();
    const email = new SimulatedSender();
    const first = await dispatcher({ PUSH: push, EMAIL: email }).dispatchPending();
    expect(first).toMatchObject({ claimed: pending, simulated: pending, failed: 0 });
    expect(push.sent.every((m) => m.recipient.email.endsWith('@reindrop.test') && m.title.startsWith('Strong deal: '))).toBe(true);
    expect(push.sent.length + email.sent.length).toBe(pending);
    expect(email.sent.every((m) => m.recipient.userId === bob)).toBe(true);
    const simulated = await prisma.notificationDelivery.findMany({ where: { status: 'SIMULATED', alert: { userId: { in: [alice, bob] } } } });
    expect(simulated).toHaveLength(pending);
    expect(simulated.every((d) => d.provider === 'simulator' && d.sentAt !== null && d.attempts === 1 && d.lockedUntil === null)).toBe(true);
    // Again: nothing left to send.
    expect(await dispatcher({ PUSH: push, EMAIL: email }).dispatchPending()).toMatchObject({ claimed: 0 });
  });

  it('retries a failing channel with backoff, then marks it FAILED; no provider -> SKIPPED not_configured', async () => {
    const alert = (await alertsOf(alice))[0]!;
    const deliveries = (where: object) => prisma.notificationDelivery.findFirstOrThrow({ where: { alertId: alert.id, ...where } });
    await prisma.notificationDelivery.updateMany({ where: { alertId: alert.id, channel: 'PUSH' }, data: { status: 'PENDING', attempts: 0, lockedUntil: new Date(t), sentAt: null } });
    const broken: NotificationSender = { send: () => Promise.reject(new Error('push service down')) };

    expect(await dispatcher({ PUSH: broken }, 2).dispatchPending()).toMatchObject({ claimed: 1, retrying: 1 });
    expect(await deliveries({ channel: 'PUSH' })).toMatchObject({ status: 'PENDING', attempts: 1, reason: 'push service down' });
    expect(await dispatcher({ PUSH: broken }, 2).dispatchPending()).toMatchObject({ claimed: 0 }); // backing off
    t += 60_000;
    expect(await dispatcher({ PUSH: broken }, 2).dispatchPending()).toMatchObject({ claimed: 1, failed: 1 });
    expect(await deliveries({ channel: 'PUSH' })).toMatchObject({ status: 'FAILED', attempts: 2, reason: 'push service down' });

    await prisma.notificationDelivery.updateMany({ where: { alertId: alert.id, channel: 'PUSH' }, data: { status: 'PENDING', attempts: 0, lockedUntil: new Date(t) } });
    expect(await dispatcher({}).dispatchPending()).toMatchObject({ claimed: 1, skipped: 1 });
    expect(await deliveries({ channel: 'PUSH' })).toMatchObject({ status: 'SKIPPED', reason: 'not_configured' });
  });

  it('push: each registered device through its provider; dead tokens switched off; no device -> skipped', async () => {
    const alert = (await alertsOf(alice))[0]!;
    const resetPush = () =>
      prisma.notificationDelivery.updateMany({ where: { alertId: alert.id, channel: 'PUSH' }, data: { status: 'PENDING', attempts: 0, lockedUntil: new Date(t), reason: null, provider: null } });
    const push = (where: object = {}) => prisma.notificationDelivery.findFirstOrThrow({ where: { alertId: alert.id, channel: 'PUSH', ...where } });

    // No phone registered: nothing to send to.
    await resetPush();
    const simulator = new SimulatedPushProvider();
    const sender = (expoFetch: typeof fetch) =>
      new PushNotificationSender(prisma, { dev_simulated: simulator, expo: new ExpoPushProvider({ fetch: expoFetch }) });
    const expoSays = (tickets: object[]) =>
      (async (_url: string | URL | Request, init?: RequestInit) => {
        expoRequests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: tickets }), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
    const expoRequests: unknown[] = [];
    expect(await dispatcher({ PUSH: sender(expoSays([])) }).dispatchPending()).toMatchObject({ claimed: 1, skipped: 1 });
    expect(await push()).toMatchObject({ status: 'SKIPPED', reason: 'no_device' });

    // Two phones: Expo Go (development token) + a development build (Expo token Expo says is gone).
    await prisma.pushDevice.createMany({
      data: [
        { userId: alice, provider: 'dev_simulated', token: `dev-simulated:${randomUUID()}`, platform: 'android' },
        { userId: alice, provider: 'expo', token: `ExponentPushToken[int-test-${randomUUID().slice(0, 8)}]`, platform: 'ios' },
      ],
    });
    await resetPush();
    const gone = { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };
    expect(await dispatcher({ PUSH: sender(expoSays([gone])) }).dispatchPending()).toMatchObject({ claimed: 1, simulated: 1 });
    expect(await push()).toMatchObject({ status: 'SIMULATED', provider: 'simulator' });
    expect(simulator.sent.at(-1)).toMatchObject({ title: alert.title, data: { alertId: alert.id, dealId: alert.huntMatchId }, channelId: 'alerts' });
    expect(expoRequests).toHaveLength(1);
    const expoDevice = await prisma.pushDevice.findFirstOrThrow({ where: { userId: alice, provider: 'expo' } });
    expect(expoDevice).toMatchObject({ disabledReason: 'device_not_registered' });
    expect(expoDevice.disabledAt).not.toBeNull();

    // Expo accepts a re-enabled device: a real send (SENT, provider expo).
    await prisma.pushDevice.updateMany({ where: { userId: alice }, data: { disabledAt: null, disabledReason: null } });
    await prisma.pushDevice.updateMany({ where: { userId: alice, provider: 'dev_simulated' }, data: { disabledAt: new Date(t), disabledReason: 'unregistered' } });
    await resetPush();
    expect(await dispatcher({ PUSH: sender(expoSays([{ status: 'ok', id: 'ticket-1' }])) }).dispatchPending()).toMatchObject({ claimed: 1, sent: 1 });
    expect(await push()).toMatchObject({ status: 'SENT', provider: 'expo' });

    // Every device gone -> skipped, not retried forever.
    await resetPush();
    expect(await dispatcher({ PUSH: sender(expoSays([gone])) }).dispatchPending()).toMatchObject({ claimed: 1, skipped: 1 });
    expect(await push()).toMatchObject({ status: 'SKIPPED', reason: 'no_device' });
  });

  it('a deal the user ignored before its analysis finished never alerts', async () => {
    // A fresh match that is eligible: take one of Alice's alerted deals, forget its alert and analyses,
    // mark it ignored, and analyse it again.
    const alert = (await alertsOf(alice))[1] ?? (await alertsOf(alice))[0]!;
    await prisma.alert.delete({ where: { id: alert.id } });
    await prisma.huntMatch.update({ where: { id: alert.huntMatchId! }, data: { status: 'DISMISSED' } });
    await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: alert.huntMatchId! } });
    t += INTERVAL;
    await runWorker();
    expect(await prisma.alert.count({ where: { huntMatchId: alert.huntMatchId! } })).toBe(0);
  });
});
