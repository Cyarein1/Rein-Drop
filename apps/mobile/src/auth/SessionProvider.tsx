import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@rein-drop/api-client';
import { getApiClient } from '@/config/api';
import { authSetup } from './provider';
import type { Session } from './types';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; session: Session }
  /** Auth unavailable or the API rejected the identity (e.g. dev user not seeded). */
  | { status: 'unauthenticated'; reason: string }
  /** Could not verify (API unreachable, timeout) - retryable. */
  | { status: 'error'; message: string };

interface SessionContextValue {
  state: SessionState;
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Loads the current user from `GET /me` through the auth boundary. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authSetup.ok) {
      const reason = authSetup.reason;
      queueMicrotask(() => setState({ status: 'unauthenticated', reason }));
      return;
    }
    const provider = authSetup.provider;
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getMe())
      .then(
        (user) => {
          if (!cancelled) {
            setState({
              status: 'authenticated',
              session: { user, provider: provider.id, isDevelopment: provider.id === 'dev' },
            });
          }
        },
        (err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            setState({ status: 'unauthenticated', reason: err.message });
          } else {
            setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return <SessionContext.Provider value={{ state, refresh }}>{children}</SessionContext.Provider>;
}

export function useSessionState(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSessionState must be used inside <SessionProvider>');
  return value;
}

/** The signed-in session. Only call inside screens gated by an authenticated state. */
export function useSession(): Session {
  const { state } = useSessionState();
  if (state.status !== 'authenticated') {
    throw new Error('useSession() called without an authenticated session');
  }
  return state.session;
}
