import type { Refreshable } from '@rein-drop/client-core';
import { Button, LoadingState, SystemBanner } from '@/ui';

/**
 * The loading / error / "couldn't refresh" part of a list screen (client-core `Refreshable`).
 * Renders nothing once data is on screen and fresh.
 */
export function LoadStatus<T>({ state, what, onRetry }: { state: Refreshable<T>; what: string; onRetry: () => void }) {
  const retry = (
    <Button variant="secondary" onPress={onRetry}>
      Try again
    </Button>
  );
  if (state.status === 'loading') return <LoadingState label={`Loading your ${what}…`} />;
  if (state.status === 'error') {
    return <SystemBanner tone={state.offline ? 'warning' : 'error'} title={`Couldn't load your ${what}`} message={state.message} action={retry} />;
  }
  if (state.refreshError) {
    return <SystemBanner tone="info" title="Showing what was loaded earlier" message={`Couldn't refresh. ${state.refreshError}`} action={retry} />;
  }
  return null;
}
