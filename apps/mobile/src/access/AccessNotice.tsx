import { companionAccessView, huntFormContext, type CompanionAccessKind } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { SystemBanner } from '@/ui';
import { useAccess } from './AccessProvider';

const TITLE: Partial<Record<CompanionAccessKind, string>> = {
  suspended: 'Access suspended',
  needs_attention: 'Your account needs attention',
  grace: 'Your account needs attention',
  ended: 'No access to paid features',
};

/**
 * A neutral note about the account's access on a tab (decision 0018) - only when something
 * differs from normal use. Never a price, an upgrade or a link to pay.
 * `only` limits which situations this tab mentions (Deals: suspension only).
 */
export function AccessNotice({ only }: { only?: CompanionAccessKind[] }) {
  const { load } = useAccess();
  const { state } = useSessionState();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  if (!access || state.status !== 'authenticated') return null;
  const view = companionAccessView(access, huntFormContext(state.session.user.locale).localeTag);
  const title = TITLE[view.kind];
  if (!title || (only && !only.includes(view.kind))) return null;
  return <SystemBanner tone={view.tone === 'loss' ? 'error' : view.tone === 'fresh' ? 'warning' : 'info'} title={title} message={view.lines.join(' ')} />;
}

/** False only while the account is suspended (Hunts can't be created or started). */
export function useCanUseHunts(): boolean {
  const { load } = useAccess();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  return !(access?.suspended ?? false);
}
