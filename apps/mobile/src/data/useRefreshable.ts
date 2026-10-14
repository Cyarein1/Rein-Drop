import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError } from '@rein-drop/api-client';
import { refreshFailed, refreshStarted, refreshSucceeded, refreshUpdated, type Refreshable } from '@rein-drop/client-core';

/** No HTTP status = no answer at all (offline, timeout, DNS). */
export function isOffline(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === undefined;
}

const LOADING = { status: 'loading' } as const;

/**
 * Screen data that survives a bad connection (client-core `Refreshable`): loads on focus,
 * `refresh()` for pull-to-refresh (visible spinner), `retry()` after a first-load error.
 * `key` identifies the query - a new key (e.g. another filter) starts from a loading state.
 */
export function useRefreshable<T>(fetch: () => Promise<T>, key: string) {
  const [stored, setStored] = useState<{ key: string; value: Refreshable<T> }>({ key, value: LOADING });
  const value: Refreshable<T> = stored.key === key ? stored.value : LOADING;
  const latest = useRef(0);

  const run = useCallback(
    (visible: boolean) => {
      const ticket = ++latest.current;
      setStored((s) => ({ key, value: refreshStarted(s.key === key ? s.value : LOADING, visible) }));
      fetch().then(
        (data) => ticket === latest.current && setStored({ key, value: refreshSucceeded(data) }),
        (err: unknown) =>
          ticket === latest.current &&
          setStored((s) => ({ key, value: refreshFailed(s.key === key ? s.value : LOADING, err instanceof Error ? err.message : String(err), isOffline(err)) })),
      );
    },
    [fetch, key],
  );

  // Reload whenever the screen comes into focus (e.g. back from a detail) - silently.
  useFocusEffect(useCallback(() => run(false), [run]));

  return {
    state: value,
    refresh: useCallback(() => run(true), [run]),
    retry: useCallback(() => run(false), [run]),
    update: useCallback((fn: (data: T) => T) => setStored((s) => (s.key === key ? { key, value: refreshUpdated(s.value, fn) } : s)), [key]),
  };
}
