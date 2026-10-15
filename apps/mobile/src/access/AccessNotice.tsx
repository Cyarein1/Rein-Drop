import { companionAccessView, type CompanionAccessKind } from '@rein-drop/client-core';
import type { MessageKey } from '@rein-drop/i18n';
import { useSessionState } from '@/auth/SessionProvider';
import { useDisplayContext } from '@/i18n/useT';
import { SystemBanner } from '@/ui';
import { useAccess } from './AccessProvider';

const TITLE: Partial<Record<CompanionAccessKind, MessageKey>> = {
  suspended: 'access.titleSuspended',
  needs_attention: 'access.titleNeedsAttention',
  grace: 'access.titleNeedsAttention',
  ended: 'access.titleNoPaidAccess',
};

/**
 * A neutral note about the account's access on a tab (decision 0018) - only when something
 * differs from normal use. Never a price, an upgrade or a link to pay.
 * `only` limits which situations this tab mentions (Deals: suspension only).
 */
export function AccessNotice({ only }: { only?: CompanionAccessKind[] }) {
  const { load } = useAccess();
  const { state } = useSessionState();
  const ctx = useDisplayContext();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  if (!access || state.status !== 'authenticated') return null;
  const view = companionAccessView(access, ctx.localeTag, ctx.t);
  const title = TITLE[view.kind];
  if (!title || (only && !only.includes(view.kind))) return null;
  return <SystemBanner tone={view.tone === 'loss' ? 'error' : view.tone === 'fresh' ? 'warning' : 'info'} title={ctx.t(title)} message={view.lines.join(' ')} />;
}

/** False only while the account is suspended (Hunts can't be created or started). */
export function useCanUseHunts(): boolean {
  const { load } = useAccess();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  return !(access?.suspended ?? false);
}
