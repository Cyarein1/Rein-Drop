/**
 * Loading a screen's data on an unreliable connection (mobile companion, decision 0018):
 * - the first load shows a loading state, and a failure shows an error with Try again;
 * - a later refresh (screen focus, pull to refresh) keeps what's already on screen - a failure
 *   adds a small "couldn't refresh" note instead of replacing the content with an error.
 */
export type Refreshable<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; offline: boolean }
  | { status: 'ready'; data: T; refreshing: boolean; refreshError: string | null };

export const OFFLINE_MESSAGE = "You're offline or Rein Drop can't be reached right now.";

export function refreshStarted<T>(state: Refreshable<T>, visible: boolean): Refreshable<T> {
  return state.status === 'ready' ? { ...state, refreshing: visible } : { status: 'loading' };
}

export function refreshSucceeded<T>(data: T): Refreshable<T> {
  return { status: 'ready', data, refreshing: false, refreshError: null };
}

export function refreshFailed<T>(state: Refreshable<T>, message: string, offline: boolean): Refreshable<T> {
  const text = offline ? OFFLINE_MESSAGE : message;
  return state.status === 'ready' ? { ...state, refreshing: false, refreshError: text } : { status: 'error', message: text, offline };
}

/** Change the loaded data in place (e.g. after an action or "Show more"). */
export function refreshUpdated<T>(state: Refreshable<T>, update: (data: T) => T): Refreshable<T> {
  return state.status === 'ready' ? { ...state, data: update(state.data) } : state;
}
