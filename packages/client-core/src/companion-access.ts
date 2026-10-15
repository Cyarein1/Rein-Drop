import type { ActivationBlockReason, EntitlementEvaluation, MarketplaceKey } from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';

/**
 * Wording for the MOBILE companion apps (decision 0018). The apps never sell:
 * - no prices, plan comparisons, "upgrade" or checkout;
 * - no "subscribe / buy on the web".
 *
 * Limits are explained neutrally as "your current access" with what the person can do inside it
 * (pause another Hunt, remove a marketplace). The web keeps its own wording (plan gate, billing).
 *
 * Guarded by client-core.spec (no selling words in any companion string, English and German).
 */

const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
const list = (items: string[], t: Translator) =>
  items.length <= 1 ? items.join('') : t('access.listAnd', { items: items.slice(0, -1).join(', '), last: items.at(-1) });
const EN = translator('en');
/** `.map(fn)` passes the array index as the 2nd argument - only a real translator counts. */
const tr = (t: unknown): Translator => (typeof t === 'function' ? (t as Translator) : EN);

/** "Your current access includes 1 live Hunt (1 in use)." / "...unlimited live Hunts..." */
export function companionAccessSummary(e: Pick<EntitlementEvaluation, 'entitlements' | 'usage'>, t: Translator = EN): string {
  const limit = e.entitlements.activeHunts.limit;
  const used = e.usage.activeHunts;
  return limit === null ? t('access.summaryUnlimited', { used }) : t('access.summaryLimit', { limit, used });
}

/**
 * One neutral sentence per activation block reason - never "upgrade". The second argument is the
 * translator (English when missing, or when used directly as `reasons.map(companionReasonText)`).
 */
export function companionReasonText(reason: ActivationBlockReason, translatorOrIndex?: Translator | number): string {
  const t = tr(translatorOrIndex);
  switch (reason.code) {
    case 'NOT_READY':
      // Readiness problems come from the API / contracts as they are.
      return reason.problems.join(' ');
    case 'ACTIVE_HUNT_LIMIT_REACHED':
      return t('access.reasonHuntLimit', { limit: reason.limit, used: reason.used });
    case 'MARKETPLACE_NOT_IN_PLAN': {
      const names = reason.marketplaces.map((m) => MARKETPLACE_LABEL[m] ?? m);
      return t('access.reasonMarketplace', { names: list(names, t), count: names.length });
    }
    case 'PRIORITY_NOT_IN_PLAN':
      return t('access.reasonPriority');
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
export function accountSiteLine(site: string | null | undefined, t: Translator = EN): string | null {
  const host = site?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return host ? t('access.accountSite', { host }) : null;
}

/** Words a companion screen must never show (used by tests on every companion string). */
export const SELLING_WORDS = /\b(upgrade|subscribe|subscription plans?|buy|purchase|pricing|price|checkout|pay|payment|plans? (?:page|comparison)|bigger plan|choose a plan|see plans)\b/i;

/**
 * German selling words a companion screen must never show (decision 0018), for the German drafts.
 * Matches plan buying only: the reseller's own stock purchases ("Kaufpreis", "gekauft", "verkaufen")
 * are fine, and "kostenpflichtige Funktionen" is the neutral glossary term for paid features.
 */
export const SELLING_WORDS_DE =
  /(\bupgrad\w*|\babonn\w*|\babos?\b|\bkauf(en|e|t)?\b|\bkäufe?\b|\bjetzt kaufen\b|\bpreis(e|en|liste|plan|pläne)?\b|\bbezahl\w*|\bzahlung\w*|\bcheckout\b|\btarif\w*\s+(wählen|ansehen|vergleichen)\b|\btarifvergleich\w*|\bgrößere[nmrs]? tarif\w*|\bim web\b|\bwebsite\b|\bwebseite\b)/i;
