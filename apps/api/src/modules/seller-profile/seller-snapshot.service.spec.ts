import { createFakeSellerProfilePrisma } from './fake-prisma.js';
import { SellerSnapshotService } from './seller-snapshot.service.js';

const USER = 'user-1';

function setup() {
  const fake = createFakeSellerProfilePrisma();
  return { ...fake, service: new SellerSnapshotService(fake.prisma) };
}

describe('SellerSnapshotService', () => {
  it('returns an empty snapshot without creating a profile', async () => {
    const { service, rows } = setup();
    const snapshot = await service.get(USER);
    expect(snapshot.completedAt).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('saves answers progressively and marks completion once all five are answered', async () => {
    const { service } = setup();
    await service.update(USER, { categories: ['phones_tablets'] });
    await service.update(USER, { stage: 'side_income' });
    await service.update(USER, { sources: ['facebook_marketplace', 'ebay'] });
    const four = await service.update(USER, { dealRule: { criterion: 'min_margin', targetPercent: 30 } });
    expect(four.completedAt).toBeNull();

    const five = await service.update(USER, { improvementGoal: 'stop_checking_marketplaces' });
    expect(five).toMatchObject({
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

  it('PUT-style save completes in one call', async () => {
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
    expect(snapshot.categoriesOther).toBe('Vinyl records');
    expect(snapshot.completedAt).not.toBeNull();
  });

  it('switching the deal rule clears the previous target', async () => {
    const { service, rows } = setup();
    await service.update(USER, { dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } } });
    const snapshot = await service.update(USER, { dealRule: { criterion: 'fast_resale' } });
    expect(snapshot.dealRule).toEqual({ criterion: 'fast_resale' });
    expect(rows.get(USER)).toMatchObject({ dealTargetAmountMinor: null, dealTargetCurrency: null });
  });
});
