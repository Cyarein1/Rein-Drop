/**
 * English source text - area: access (mobile companion account wording, decision 0018). Keys are
 * stable ids; text can change freely. NEUTRAL ONLY: no prices, plans to choose, upgrade, subscribe,
 * checkout or "on the web" (guarded by SELLING_WORDS / SELLING_WORDS_DE in client-core tests).
 */
export default {
  summaryUnlimited: 'Your current access includes unlimited live Hunts ({used} in use).',
  summaryLimit: '{limit, plural, one {Your current access includes # live Hunt ({used} in use).} other {Your current access includes # live Hunts ({used} in use).}}',
  reasonHuntLimit:
    '{limit, plural, one {Your current access includes # live Hunt} other {Your current access includes # live Hunts}}, and {used, plural, one {# is live} other {# are live}}. Pause another Hunt to watch this one - it stays saved as a draft.',
  reasonMarketplace:
    "{count, plural, one {Your current access doesn't include {names}. Remove it from this Hunt to start watching.} other {Your current access doesn't include {names}. Remove them from this Hunt to start watching.}}",
  reasonPriority: "Your current access doesn't include this monitoring priority. Set the Hunt to normal priority to start watching.",
  listAnd: '{items} and {last}',
  accountSite: 'You can manage your account at {host}.',
  // Account access (GET /me/access)
  noPaidAccess: "This account doesn't currently have access to paid features.",
  dataKept: 'Your Hunts, inventory and saved deals are kept.',
  dataKeptPaused: "Your Hunts, inventory and saved deals are kept. Hunts beyond what's included now are paused, not deleted.",
  labelSuspended: 'Suspended',
  suspendedLine: "This account's access is suspended by Rein Drop, so Hunts aren't being watched.",
  labelActive: 'Active',
  continuesUntil: 'Your current access continues until {date}.',
  planActive: 'Your {plan} access is active.',
  accessActive: 'Your access is active.',
  labelTrial: 'Trial',
  trialUntil: 'Your trial access continues until {date}.',
  trialActive: 'Your trial access is active.',
  labelNeedsAttention: 'Needs attention',
  needsAttentionLine: 'Your account needs attention. Your current access continues for now.',
  continuesShort: 'Your current access continues for a short time.',
  labelFree: 'Free',
  usageLive: 'Live Hunts: {used} of {limit}',
  usageLiveUnlimited: 'Live Hunts: {used} (no limit)',
  usageSaved: 'Saved Hunts: {used} of {limit}',
  usageSavedUnlimited: 'Saved Hunts: {used} (no limit)',

  // Access notice titles on companion tabs
  titleSuspended: 'Access suspended',
  titleNeedsAttention: 'Your account needs attention',
  titleNoPaidAccess: 'No access to paid features',
} as const;
