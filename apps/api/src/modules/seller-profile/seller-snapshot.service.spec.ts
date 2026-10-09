import { MemoryProductEventProvider, ProductEvents } from '@rein-drop/telemetry';
import { AppException } from '../../common/errors/app.exception.js';
import { createFakeSellerProfilePrisma } from './fake-prisma.js';
import { SellerSnapshotService } from './seller-snapshot.service.js';

const USER = '01920000-0000-7000-8000-000000000001';

function setup() {
  const fake = createFakeSellerProfilePrisma();
  const tracked = new MemoryProductEventProvider();
  return { ...fake, tracked, service: new SellerSnapshotService(fake.prisma, new ProductEvents(tracked, { source: 'api' })) };
}

describe('SellerSnapshotService', () => {
  it('returns an empty snapshot without creating a profile', async () => {
    const { service, rows } = setup();
    const snapshot = await service.get(USER);
    expect(snapshot).toMatchObject({ isReseller: null, status: 'not_started', completedAt: null });
    expect(rows.size).toBe(0);
  });

  it('saves answers progressively and marks completion once a reseller answers all five', async () => {
    const { service } = setup();
    expect((await service.update(USER, { isReseller: true })).status).toBe('in_progress');
    await service.update(USER, { categories: ['phones_tablets'] });
    await service.update(USER, { stage: 'side_income' });
    await service.update(USER, { sources: ['facebook_marketplace', 'ebay'] });
    const four = await service.update(USER, { dealRule: { criterion: 'min_margin', targetPercent: 30 } });
    expect(four).toMatchObject({ status: 'in_progress', completedAt: null });

    const five = await service.update(USER, { improvementGoal: 'stop_checking_marketplaces' });
    expect(five).toMatchObject({
      isReseller: true,
      status: 'complete',
      categories: ['phones_tablets'],
      stage: 'side_income',
      sources: ['facebook_marketplace', 'ebay'],
      dealRule: { criterion: 'min_margin', targetPercent: 30 },
      improvementGoal: 'stop_checking_marketplaces',
    });
    expect(five.completedAt).not.toBeNull();

    // Later edits keep the original completion time.
    const edited = await service.update(USER, { stage: 'full_time' });
    expect(edited.completedAt).toBe(five.completedAt);
    expect(await service.get(USER)).toEqual(edited);
  });

  it('records onboarding_started on the first save and onboarding_completed once, with no answers in the events', async () => {
    const { service, tracked } = setup();
    await service.update(USER, { isReseller: true });
    await service.update(USER, { categories: ['phones_tablets'] });
    await service.update(USER, { stage: 'side_income' });
    await service.update(USER, { sources: ['ebay'] });
    await service.update(USER, { dealRule: { criterion: 'min_margin', targetPercent: 30 } });
    expect(tracked.events.map((e) => e.name)).toEqual(['onboarding_started']);
    await service.update(USER, { improvementGoal: 'stop_checking_marketplaces' });
    await service.update(USER, { stage: 'full_time' }); // a later edit is not another completion
    expect(tracked.events.map((e) => e.name)).toEqual(['onboarding_started', 'onboarding_completed']);
    expect(tracked.events.every((e) => e.distinctId === USER && Object.keys(e.properties).length === 0)).toBe(true);
  });

  it('records nothing for a refused save', async () => {
    const { service, tracked } = setup();
    await service.update(USER, { stage: 'side_income' }).catch(() => undefined);
    expect(tracked.events).toEqual([]);
  });

  it('accepts the gate and the first answer in one request', async () => {
    const { service } = setup();
    const snapshot = await service.update(USER, { isReseller: true, categories: ['tools'] });
    expect(snapshot).toMatchObject({ status: 'in_progress', categories: ['tools'] });
  });

  it('refuses profile answers until the user says they are a reseller', async () => {
    const { service, rows } = setup();
    const err = await service.update(USER, { stage: 'side_income' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(rows.size).toBe(0);

    await service.update(USER, { isReseller: false });
    await expect(service.update(USER, { stage: 'side_income' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('"no" shows not_reseller and keeps earlier answers for when they switch back', async () => {
    const { service } = setup();
    await service.update(USER, { isReseller: true, stage: 'side_income' });
    const no = await service.update(USER, { isReseller: false });
    expect(no.status).toBe('not_reseller');
    const yes = await service.update(USER, { isReseller: true });
    expect(yes).toMatchObject({ status: 'in_progress', stage: 'side_income' });
  });

  it('PUT-style save completes in one call and records the user as a reseller', async () => {
    const { service } = setup();
    const snapshot = await service.save(USER, {
      categories: ['other'],
      categoriesOther: 'Vinyl records',
      stage: 'getting_started',
      sources: ['ebay'],
      sourcesOther: null,
      dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } },
      improvementGoal: 'find_deals_faster',
    });
    expect(snapshot).toMatchObject({ isReseller: true, status: 'complete', categoriesOther: 'Vinyl records' });
    expect(snapshot.completedAt).not.toBeNull();
  });

  it('switching the deal rule clears the previous target', async () => {
    const { service, rows } = setup();
    await service.update(USER, {
      isReseller: true,
      dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } },
    });
    const snapshot = await service.update(USER, { dealRule: { criterion: 'fast_resale' } });
    expect(snapshot.dealRule).toEqual({ criterion: 'fast_resale' });
    expect(rows.get(USER)).toMatchObject({ dealTargetAmountMinor: null, dealTargetCurrency: null });
  });
});
