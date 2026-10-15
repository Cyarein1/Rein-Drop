import { View } from 'react-native';
import type { Refreshable } from '@rein-drop/client-core';
import { useT } from '@/i18n/useT';
import { Button, SkeletonRows, SystemBanner } from '@/ui';

/**
 * The loading / error / "couldn't refresh" part of a list screen (client-core `Refreshable`).
 * First load: placeholder rows (full-bleed - place it where list rows go), named for screen
 * readers with one whole sentence ("Loading your deals…"). Renders nothing once data is on screen
 * and fresh. `what` names the list: deals, Hunts, inventory or listings.
 */
export function LoadStatus<T>({ state, what, onRetry, rows = 5 }: { state: Refreshable<T>; what: string; onRetry: () => void; rows?: number }) {
  const t = useT();
  const list = what.toLowerCase();
  const retry = (
    <Button variant="secondary" size="small" onPress={onRetry}>
      {t('common.tryAgain')}
    </Button>
  );
  if (state.status === 'loading') {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('states.loadingList', { what: list })}>
        <SkeletonRows count={rows} />
      </View>
    );
  }
  if (state.status === 'error') {
    return <SystemBanner tone={state.offline ? 'warning' : 'error'} title={t('states.loadFailedList', { what: list })} message={state.message} action={retry} />;
  }
  if (state.refreshError) {
    return <SystemBanner tone="info" title={t('states.showingEarlier')} message={t('states.refreshFailed', { message: state.refreshError })} action={retry} />;
  }
  return null;
}
