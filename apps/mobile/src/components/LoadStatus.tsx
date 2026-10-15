import type { Refreshable } from '@rein-drop/client-core';
import { useT } from '@/i18n/useT';
import { Button, LoadingState, SystemBanner } from '@/ui';

/**
 * The loading / error / "couldn't refresh" part of a list screen (client-core `Refreshable`).
 * Renders nothing once data is on screen and fresh. `what` names the list: deals, Hunts,
 * inventory or listings (one whole translated sentence each - never a fragment).
 */
export function LoadStatus<T>({ state, what, onRetry }: { state: Refreshable<T>; what: string; onRetry: () => void }) {
  const t = useT();
  const list = what.toLowerCase();
  const retry = (
    <Button variant="secondary" onPress={onRetry}>
      {t('common.tryAgain')}
    </Button>
  );
  if (state.status === 'loading') return <LoadingState label={t('states.loadingList', { what: list })} />;
  if (state.status === 'error') {
    return <SystemBanner tone={state.offline ? 'warning' : 'error'} title={t('states.loadFailedList', { what: list })} message={state.message} action={retry} />;
  }
  if (state.refreshError) {
    return <SystemBanner tone="info" title={t('states.showingEarlier')} message={t('states.refreshFailed', { message: state.refreshError })} action={retry} />;
  }
  return null;
}
