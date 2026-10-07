import { ENTITLEMENT_KEYS as K } from '@rein-drop/contracts';
import { toEntitlements } from './plans.mapper.js';

const row = (key: string, limit: number | null, value: string | null = null) => ({ key, limit, value });

describe('toEntitlements', () => {
  it('maps entitlement rows to the typed shape', () => {
    expect(
      toEntitlements([
        row(K.activeHuntsMax, 1),
        row(`${K.marketplacePrefix}facebook`, null),
        row(`${K.marketplacePrefix}ebay`, null),
        row(`${K.marketplacePrefix}craigslist`, null), // unknown marketplace ignored
        row(K.hotHuntsEnabled, 0),
        row(K.hotHuntsMax, 0),
        row(K.monitoringPriority, null, 'NORMAL'),
        row(K.analyticsHistoryDays, 30),
        row(K.seatsMax, 1),
      ]),
    ).toEqual({
      activeHunts: { limit: 1 },
      marketplaces: ['ebay', 'facebook'],
      hotHunts: { available: false, limit: 0 },
      monitoringPriority: 'NORMAL',
      analyticsHistoryDays: 30,
      seats: 1,
    });
  });

  it('treats null limits as unlimited and enables Hot Hunts only when flagged', () => {
    const e = toEntitlements([
      row(K.activeHuntsMax, null),
      row(K.hotHuntsEnabled, 1),
      row(K.hotHuntsMax, null),
      row(K.analyticsHistoryDays, null),
    ]);
    expect(e.activeHunts.limit).toBeNull();
    expect(e.hotHunts).toEqual({ available: true, limit: null });
    expect(e.analyticsHistoryDays).toBeNull();
  });

  it('fails closed when rows are missing', () => {
    expect(toEntitlements([])).toEqual({
      activeHunts: { limit: 0 },
      marketplaces: [],
      hotHunts: { available: false, limit: 0 },
      monitoringPriority: 'NORMAL',
      analyticsHistoryDays: 0,
      seats: 1,
    });
  });
});
