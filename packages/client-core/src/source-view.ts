import type { SourceHealth, SourceStatus } from '@rein-drop/contracts';
import { MARKETPLACE_LABEL, type DealTone } from './deal-view.js';

/**
 * How Rein Drop talks about a marketplace source that isn't fully working (decision 0009):
 * calm and specific - what is affected, that the others continue, and that retrying is automatic.
 * Never an error state for the user: a degraded source is information ("info"), a source that
 * isn't responding is a "warning", nothing is "error".
 */

/** Short phrase for a source's own state, or null when it's working normally / unknown. */
export function sourceIssue(source: SourceStatus): { label: string; phrase: string; tone: DealTone } | null {
  switch (source.status) {
    case 'down':
      return { label: 'Not responding', phrase: "isn't responding right now", tone: 'fresh' };
    case 'not_configured':
      return { label: 'Not set up', phrase: "isn't set up", tone: 'neutral' };
    case 'degraded':
      switch (source.reason) {
        case 'slow':
        case 'timeout':
          return { label: 'Slow right now', phrase: 'is slow right now', tone: 'fresh' };
        case 'partial':
          return { label: 'Fewer results', phrase: 'is returning fewer results right now', tone: 'fresh' };
        case 'rate_limited':
          return { label: 'Limiting checks', phrase: 'is limiting how often Rein Drop can check', tone: 'fresh' };
        default:
          return { label: 'Having trouble', phrase: 'is having trouble right now', tone: 'fresh' };
      }
    default:
      return null;
  }
}

const minutesUntil = (iso: string, now: Date) => Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 60_000));
/** "in 4 min" / "in 2 h". */
export function retryText(iso: string, now: Date): string {
  const m = minutesUntil(iso, now);
  return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`;
}

export interface SourceBanner {
  /** info for a slow / partial source, warning when one isn't responding; never "error". */
  tone: 'info' | 'warning';
  title: string;
  message: string;
}

/**
 * One calm line for Home / Hunts / Deals when a source is impaired, saying the others continue.
 * Null when every source is working (or simply hasn't reported yet).
 */
export function sourceBanner(sources: readonly SourceHealth[], now: Date): SourceBanner | null {
  const impaired = sources.filter((s) => sourceIssue(s) !== null);
  if (impaired.length === 0) return null;
  const working = sources.filter((s) => s.status === 'healthy').map((s) => MARKETPLACE_LABEL[s.marketplace]);
  const anyDown = impaired.some((s) => s.status === 'down');
  const retry = impaired.map((s) => s.nextAttemptAt).filter((t): t is string => t !== null).sort()[0];
  const retrying = retry ? `Rein Drop tries again ${retryText(retry, now)}` : 'Rein Drop retries automatically';

  if (impaired.length === 1) {
    const s = impaired[0]!;
    const name = MARKETPLACE_LABEL[s.marketplace];
    const issue = sourceIssue(s)!;
    if (s.status === 'not_configured') {
      return { tone: 'warning', title: `${name} ${issue.phrase}`, message: `Hunts can't search it until it is.${working.length > 0 ? ` ${joinNames(working)} ${working.length === 1 ? 'continues' : 'continue'} as normal.` : ''}` };
    }
    const others = working.length > 0 ? `${joinNames(working)} ${working.length === 1 ? 'checks continue' : 'checks continue'} as normal. ` : '';
    return {
      tone: anyDown ? 'warning' : 'info',
      title: `${name} ${issue.phrase}`,
      message: `${others}${retrying}; nothing you need to do.${s.status === 'down' ? ' New deals from it may arrive late.' : ''}`,
    };
  }
  return {
    tone: anyDown ? 'warning' : 'info',
    title: 'Marketplaces are having trouble right now',
    message: `${joinNames(impaired.map((s) => MARKETPLACE_LABEL[s.marketplace]))} aren't fully working. ${retrying}; your Hunts are safe and nothing you need to do.`,
  };
}

/** Whether a Hunt's monitoring is fully working: never "all good" while a source isn't. */
export type HuntMonitoringHealth = 'ok' | 'partial' | 'impaired' | 'unknown';

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
