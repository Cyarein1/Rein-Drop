import { createContext, useCallback, useContext, useEffect, useReducer, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '@rein-drop/api-client';
import { accessLoadFor, accessLoadReducer, type AccessLoad, type AccessLoadEvent } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';

/**
 * The signed-in account's effective access (`GET /me/access`, decision 0018) - the same rules the
 * API and worker enforce. Loaded after sign-in, again whenever the app returns to the foreground
 * (a change made elsewhere shows up), and on demand. Keyed by account: switching accounts never
 * shows the previous account's access. Offline keeps the last answer, marked as not current.
 */
interface AccessContextValue {
  load: AccessLoad;
  reload: () => void;
}

const AccessContext = createContext<AccessContextValue>({ load: { status: 'signed_out' }, reload: () => undefined });

/** Results only: a load always targets the account that started it. */
function reducer(state: AccessLoad, event: Extract<AccessLoadEvent, { type: 'loaded' | 'failed' }>): AccessLoad {
  return accessLoadReducer(accessLoadFor(state, event.userId), event);
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { state: session } = useSessionState();
  const userId = session.status === 'authenticated' ? session.session.user.userId : null;
  const [state, dispatch] = useReducer(reducer, { status: 'signed_out' });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getAccess())
      .then(
        (access) => !cancelled && dispatch({ type: 'loaded', userId, access }),
        (err: unknown) => {
          if (cancelled) return;
          // No answer at all (offline, timeout, sign-in service unreachable); code bugs are "failed".
          if (__DEV__ && !(err instanceof ApiError)) console.error('[AccessProvider] access load failed:', err);
          const offline = isOffline(err);
          dispatch({ type: 'failed', userId, reason: offline ? 'offline' : 'failed' });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => next === 'active' && reload());
    return () => sub.remove();
  }, [reload]);

  return <AccessContext.Provider value={{ load: accessLoadFor(state, userId), reload }}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  return useContext(AccessContext);
}
