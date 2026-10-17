import {
  DEAL_ANALYSIS_STATUSES,
  DEAL_CONFIDENCE_LEVELS,
  DEAL_MATCH_STATUSES,
  DEAL_STRENGTHS,
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  HUNT_STATUSES,
  LISTING_STATUSES,
  marketplaceKeySchema,
  INVENTORY_STATUSES,
  INVENTORY_EVENT_TYPES,
  COST_CATEGORIES,
  SELL_LISTING_STATUSES,
  SELL_CHANNEL_STATUSES,
} from '@rein-drop/contracts';
import {
  AlertChannel,
  CostCategory,
  DealAnalysisStatus,
  DeliveryStatus,
  HuntMatchStatus,
  HuntStatus,
  InventoryEventType,
  InventoryStatus,
  ListingStatus,
  SellChannelStatus,
  SellListingStatus,
} from '@rein-drop/db';
import { MARKETPLACE_IDS as CORE_MARKETPLACE_IDS } from '@rein-drop/marketplace-core';
import { CONFIDENCE_LEVELS, DEAL_STRENGTHS as SCORING_STRENGTHS } from '@rein-drop/scoring';

const sorted = (values: Iterable<string>) => [...values].sort();

/** Contracts mirror database enums by hand; this fails if either side changes alone. */
describe('contract enums match the database schema', () => {
  it.each([
    ['HuntStatus', HUNT_STATUSES, HuntStatus],
    ['ListingStatus', LISTING_STATUSES, ListingStatus],
    ['HuntMatchStatus', DEAL_MATCH_STATUSES, HuntMatchStatus],
    ['DealAnalysisStatus', DEAL_ANALYSIS_STATUSES, DealAnalysisStatus],
    ['AlertChannel', NOTIFICATION_CHANNELS, AlertChannel],
    ['DeliveryStatus', DELIVERY_STATUSES, DeliveryStatus],
    ['InventoryStatus', INVENTORY_STATUSES, InventoryStatus],
    ['CostCategory', COST_CATEGORIES, CostCategory],
    ['InventoryEventType', INVENTORY_EVENT_TYPES, InventoryEventType],
    ['SellListingStatus', SELL_LISTING_STATUSES, SellListingStatus],
    ['SellChannelStatus', SELL_CHANNEL_STATUSES, SellChannelStatus],
  ] as const)('%s', (_name, contract, prismaEnum) => {
    expect(sorted(contract)).toEqual(sorted(Object.values(prismaEnum)));
  });

  it('marketplace keys come from marketplace-core', () => {
    expect(marketplaceKeySchema.options).toEqual([...CORE_MARKETPLACE_IDS]);
  });

  it('deal strengths and confidence levels match @rein-drop/scoring (same order)', () => {
    expect([...DEAL_STRENGTHS]).toEqual([...SCORING_STRENGTHS]);
    expect([...DEAL_CONFIDENCE_LEVELS]).toEqual([...CONFIDENCE_LEVELS]);
  });
});
