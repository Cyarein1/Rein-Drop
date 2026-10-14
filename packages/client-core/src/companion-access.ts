import type { ActivationBlockReason, EntitlementEvaluation, MarketplaceKey } from '@rein-drop/contracts';

/**
 * Wording for the MOBILE companion apps (decision 0018). The apps never sell:
 * - no prices, plan comparisons, "upgrade" or checkout;
 * - no "subscribe / buy on the web".
 *
 * Limits are explained neutrally as "your current access" with what the person can do inside it
 * (pause another Hunt, remove a marketplace). The web keeps its own wording (plan gate, billing).
 *
 * Guarded by client-core.spec (no selling words in any companion string).
 */

const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** "Your current access includes 1 live Hunt (1 in use)." / "...unlimited live Hunts..." */
export function companionAccessSummary(e: Pick<EntitlementEvaluation, 'entitlements' | 'usage'>): string {
  const limit = e.entitlements.activeHunts.limit;
  const used = e.usage.activeHunts;
  return limit === null
    ? `Your current access includes unlimited live Hunts (${used} in use).`
    : `Your current access includes ${limit} live ${limit === 1 ? 'Hunt' : 'Hunts'} (${used} in use).`;
}

/** One neutral sentence per activation block reason - never "upgrade". */
export function companionReasonText(reason: ActivationBlockReason): string {
  switch (reason.code) {
    case 'NOT_READY':
      return reason.problems.join(' ');
    case 'ACTIVE_HUNT_LIMIT_REACHED':
      return `Your current access includes ${reason.limit} live ${reason.limit === 1 ? 'Hunt' : 'Hunts'}, and ${reason.used} ${reason.used === 1 ? 'is' : 'are'} live. Pause another Hunt to watch this one - it stays saved as a draft.`;
    case 'MARKETPLACE_NOT_IN_PLAN': {
      const names = reason.marketplaces.map((m) => MARKETPLACE_LABEL[m] ?? m);
      return `Your current access doesn't include ${list(names)}. Remove ${names.length === 1 ? 'it' : 'them'} from this Hunt to start watching.`;
    }
    case 'PRIORITY_NOT_IN_PLAN':
      return "Your current access doesn't include this monitoring priority. Set the Hunt to normal priority to start watching.";
  }
}

/** What the person can do about a block, inside their current access (no upgrade path). */
export function companionActions(reasons: readonly ActivationBlockReason[]): { pauseAnother: boolean; editHunt: boolean } {
  return {
    pauseAnother: reasons.some((r) => r.code === 'ACTIVE_HUNT_LIMIT_REACHED'),
    editHunt: reasons.some((r) => r.code !== 'ACTIVE_HUNT_LIMIT_REACHED'),
  };
}

/**
 * The optional, neutral account line (owner decision, decision 0018): "You can manage your account at
 * reindrop.com." - no purchase wording, no link. Shown only when the app is built with a site set
 * (EXPO_PUBLIC_ACCOUNT_SITE). OFF until the app-store compliance review (phase E).
 */
export function accountSiteLine(site: string | null | undefined): string | null {
  const host = site?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return host ? `You can manage your account at ${host}.` : null;
}

/** Words a companion screen must never show (used by tests on every companion string). */
export const SELLING_WORDS = /\b(upgrade|subscribe|subscription plans?|buy|purchase|pricing|price|checkout|pay|payment|plans? (?:page|comparison)|bigger plan|choose a plan|see plans)\b/i;
