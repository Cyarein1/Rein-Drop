import type { SourceHealth, SourceStatus } from '@rein-drop/contracts';
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import { MARKETPLACE_LABEL, type DealTone } from './deal-view.js';

/**
 * How Rein Drop talks about a marketplace source that isn't fully working (decision 0009):
 * calm and specific - what is affected, that the others continue, and that retrying is automatic.
 * Never an error state for the user: a degraded source is information ("info"), a source that
 * isn't responding is a "warning", nothing is "error".
 */

type IssueKind = 'down' | 'notConfigured' | 'slow' | 'partial' | 'rateLimited' | 'trouble';

const ISSUE: Record<IssueKind, { label: MessageKey; sentence: MessageKey; tone: DealTone }> = {
  down: { label: 'common.sourceDownLabel', sentence: 'common.sourceDown', tone: 'fresh' },
  notConfigured: { label: 'common.sourceNotConfiguredLabel', sentence: 'common.sourceNotConfigured', tone: 'neutral' },
  slow: { label: 'common.sourceSlowLabel', sentence: 'common.sourceSlow', tone: 'fresh' },
  partial: { label: 'common.sourcePartialLabel', sentence: 'common.sourcePartial', tone: 'fresh' },
  rateLimited: { label: 'common.sourceRateLimitedLabel', sentence: 'common.sourceRateLimited', tone: 'fresh' },
  trouble: { label: 'common.sourceTroubleLabel', sentence: 'common.sourceTrouble', tone: 'fresh' },
};

function issueKind(source: SourceStatus): IssueKind | null {
  switch (source.status) {
    case 'down':
      return 'down';
    case 'not_configured':
      return 'notConfigured';
    case 'degraded':
      switch (source.reason) {
        case 'slow':
        case 'timeout':
          return 'slow';
        case 'partial':
          return 'partial';
        case 'rate_limited':
          return 'rateLimited';
        default:
          return 'trouble';
      }
    default:
      return null;
  }
}

/**
 * Short label for a source's own state, or null when it's working normally / unknown.
 * `phrase` is the sentence without the marketplace name (kept for older callers; prefer
 * `sourceIssueText`, which keeps the name inside one translated sentence).
 */
export function sourceIssue(source: SourceStatus, t: Translator = translator('en')): { label: string; phrase: string; tone: DealTone } | null {
  const kind = issueKind(source);
  if (!kind) return null;
  const issue = ISSUE[kind];
  return { label: t(issue.label), phrase: t(issue.sentence, { name: '' }).trim(), tone: issue.tone };
}

/** "eBay isn't responding right now" - the source's state as one sentence, or null when fine. */
export function sourceIssueText(source: SourceStatus, name: string, t: Translator = translator('en')): string | null {
  const kind = issueKind(source);
  return kind ? t(ISSUE[kind].sentence, { name }) : null;
}

const minutesUntil = (iso: string, now: Date) => Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 60_000));
/** "in 4 min" / "in 2 h" / "in 3 days" (shared by every "next check" / "tries again" text). */
export function durationUntilText(minutes: number, t: Translator = translator('en')): string {
  if (minutes < 60) return t('common.inMinutes', { count: minutes });
  if (minutes < 48 * 60) return t('common.inHours', { count: Math.round(minutes / 60) });
  return t('common.inDays', { count: Math.round(minutes / (24 * 60)) });
}

export function retryText(iso: string, now: Date, t: Translator = translator('en')): string {
  return durationUntilText(minutesUntil(iso, now), t);
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
export function sourceBanner(sources: readonly SourceHealth[], now: Date, t: Translator = translator('en')): SourceBanner | null {
  const impaired = sources.filter((s) => issueKind(s) !== null);
  if (impaired.length === 0) return null;
  const working = sources.filter((s) => s.status === 'healthy').map((s) => MARKETPLACE_LABEL[s.marketplace]);
  const anyDown = impaired.some((s) => s.status === 'down');
  const retry = impaired.map((s) => s.nextAttemptAt).filter((at): at is string => at !== null).sort()[0];
  const sentences = (...parts: (string | null)[]) => parts.filter((p): p is string => !!p).join(' ');

  if (impaired.length === 1) {
    const s = impaired[0]!;
    const title = sourceIssueText(s, MARKETPLACE_LABEL[s.marketplace], t)!;
    const names = joinNames(working, t);
    if (s.status === 'not_configured') {
      return {
        tone: 'warning',
        title,
        message: sentences(t('common.sourceNotConfiguredBody'), working.length > 0 ? t('common.sourceNotConfiguredOthers', { names, count: working.length }) : null),
      };
    }
    return {
      tone: anyDown ? 'warning' : 'info',
      title,
      message: sentences(
        working.length > 0 ? t('common.sourceOthersContinue', { names }) : null,
        retry ? t('common.sourceRetryAt', { when: retryText(retry, now, t) }) : t('common.sourceRetryAuto'),
        s.status === 'down' ? t('common.sourceMayArriveLate') : null,
      ),
    };
  }
  return {
    tone: anyDown ? 'warning' : 'info',
    title: t('common.sourceManyTitle'),
    message: sentences(
      t('common.sourceManyIntro', { names: joinNames(impaired.map((s) => MARKETPLACE_LABEL[s.marketplace]), t) }),
      retry ? t('common.sourceManyRetryAt', { when: retryText(retry, now, t) }) : t('common.sourceManyRetryAuto'),
    ),
  };
}

/** Whether a Hunt's monitoring is fully working: never "all good" while a source isn't. */
export type HuntMonitoringHealth = 'ok' | 'partial' | 'impaired' | 'unknown';

/** "eBay and Facebook Marketplace" ("a, b and c") in the UI language. */
export function joinNames(names: string[], t: Translator = translator('en')): string {
  if (names.length <= 1) return names.join('');
  return t('common.listAnd', { items: names.slice(0, -1).join(', '), last: names.at(-1) });
}
