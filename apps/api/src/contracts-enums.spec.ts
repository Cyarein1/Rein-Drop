import {
  DEAL_ANALYSIS_STATUSES,
  DEAL_MATCH_STATUSES,
  HUNT_STATUSES,
  LISTING_STATUSES,
  marketplaceKeySchema,
} from '@rein-drop/contracts';
import { DealAnalysisStatus, HuntMatchStatus, HuntStatus, ListingStatus } from '@rein-drop/db';
import { MARKETPLACE_IDS as CORE_MARKETPLACE_IDS } from '@rein-drop/marketplace-core';

const sorted = (values: Iterable<string>) => [...values].sort();

/** Contracts mirror database enums by hand; this fails if either side changes alone. */
describe('contract enums match the database schema', () => {
  it.each([
    ['HuntStatus', HUNT_STATUSES, HuntStatus],
    ['ListingStatus', LISTING_STATUSES, ListingStatus],
    ['HuntMatchStatus', DEAL_MATCH_STATUSES, HuntMatchStatus],
    ['DealAnalysisStatus', DEAL_ANALYSIS_STATUSES, DealAnalysisStatus],
  ] as const)('%s', (_name, contract, prismaEnum) => {
    expect(sorted(contract)).toEqual(sorted(Object.values(prismaEnum)));
  });

  it('marketplace keys come from marketplace-core', () => {
    expect(marketplaceKeySchema.options).toEqual([...CORE_MARKETPLACE_IDS]);
  });
});
