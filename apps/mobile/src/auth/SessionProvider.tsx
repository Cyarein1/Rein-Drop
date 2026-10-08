import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { ApiError, detectedLocaleRequest, type AccountIdentity } from '@rein-drop/api-client';
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
  /** Interactive sign-in / sign-up; null when the provider signs in automatically (development). */
  signIn: (() => Promise<void>) | null;
  /** Forgets the session on this device; null for development auth. */
  signOut: (() => Promise<void>) | null;
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
      .then(withDetectedLocale)
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

  const provider = authSetup.ok ? authSetup.provider : null;
  const signIn = useCallback(async () => {
    if (!provider?.signIn) return;
    try {
      if ((await provider.signIn()) === 'signed_in') refresh();
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [provider, refresh]);
  const signOut = useCallback(async () => {
    if (!provider?.signOut) return;
    await provider.signOut();
    setState({ status: 'unauthenticated', reason: "You're signed out." });
  }, [provider]);

  return (
    <SessionContext.Provider value={{ state, refresh, signIn: provider?.signIn ? signIn : null, signOut: provider?.signOut ? signOut : null }}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * First sign-in: report the device locale (e.g. "en-ZA") so currency, distance unit and
 * language default to where the user is. Only while the stored locale is empty; the API
 * never lets detection overwrite an existing locale. Best effort - never blocks sign-in.
 */
async function withDetectedLocale(user: AccountIdentity): Promise<AccountIdentity> {
  if (user.locale) return user;
  const request = detectedLocaleRequest(getLocales()[0]?.languageTag);
  if (!request) return user;
  try {
    const locale = await getApiClient().updateLocale(request);
    return { ...user, locale };
  } catch {
    return user;
  }
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
