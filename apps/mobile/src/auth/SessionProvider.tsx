import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { ApiError, detectedLocaleRequest, type AccountIdentity, type UserLocale } from '@rein-drop/api-client';
import type { MessageKey, MessageValues, Translator } from '@rein-drop/i18n';
import { getApiClient, onUnauthorized } from '@/config/api';
import { forgetThisDevice } from '@/notifications/push';
import { authSetup } from './provider';
import { TranslatableError, type Session } from './types';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; session: Session }
  /**
   * Not signed in: never signed in on this phone, signed out, the session ended (expired /
   * revoked - sessionEnded), auth unavailable, or the API rejected the identity.
   */
  | { status: 'unauthenticated'; reason: string; reasonKey?: MessageKey; reasonValues?: MessageValues; sessionEnded?: boolean }
  /** Could not verify (API unreachable, timeout) - retryable. */
  | { status: 'error'; message: string; messageKey?: MessageKey };

/**
 * The text under a signed-out / error state, in the UI language. `reason` / `message` are the
 * English (or server) text; a key, when present, wins. Use this wherever the session state is shown.
 */
export function sessionMessage(state: SessionState, t: Translator): string | undefined {
  if (state.status === 'unauthenticated') return state.reasonKey ? t(state.reasonKey, state.reasonValues) : state.reason;
  if (state.status === 'error') return state.messageKey ? t(state.messageKey) : state.message;
  return undefined;
}

/** Error state from anything thrown: translatable errors keep their key. */
function errorState(err: unknown): SessionState {
  return { status: 'error', message: err instanceof Error ? err.message : String(err), messageKey: err instanceof TranslatableError ? err.messageKey : undefined };
}

interface SessionContextValue {
  state: SessionState;
  refresh: () => void;
  /** Interactive sign-in / sign-up; null when the provider signs in automatically (development). */
  signIn: (() => Promise<void>) | null;
  /** Forgets the session on this device; null for development auth. */
  signOut: (() => Promise<void>) | null;
  /** Applies a saved locale (e.g. a new language) to the signed-in session without reloading it. */
  setLocale: (locale: UserLocale | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const SESSION_ENDED = 'Your session has ended. Sign in again to continue - your Hunts, inventory and deals are kept.';

/** Loads the current user from `GET /me` through the auth boundary. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const signedInBefore = useRef(false);

  // Any 401 while signed in = the session ended (expired, revoked, absolute end): back to sign-in.
  // Hunts, inventory and deals are untouched - they're on the server.
  useEffect(
    () =>
      onUnauthorized(() =>
        setState((s) => (s.status === 'authenticated' ? { status: 'unauthenticated', reason: SESSION_ENDED, reasonKey: 'auth.sessionEnded', sessionEnded: true } : s)),
      ),
    [],
  );

  useEffect(() => {
    if (!authSetup.ok) {
      const { reason, reasonKey, reasonValues } = authSetup;
      queueMicrotask(() => setState({ status: 'unauthenticated', reason, reasonKey, reasonValues }));
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
            signedInBefore.current = true;
            setState({
              status: 'authenticated',
              session: { user, provider: provider.id, isDevelopment: provider.id === 'dev' },
            });
          }
        },
        (err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            const ended = signedInBefore.current && err.status === 401;
            setState({
              status: 'unauthenticated',
              reason: ended ? SESSION_ENDED : provider.signIn ? 'Sign in to continue.' : err.message,
              reasonKey: ended ? 'auth.sessionEnded' : provider.signIn ? 'auth.signInToContinue' : undefined,
              sessionEnded: ended,
            });
          } else {
            setState(errorState(err));
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
      setState(errorState(err));
    }
  }, [provider, refresh]);
  const signOut = useCallback(async () => {
    if (!provider?.signOut) return;
    // While the session still works: stop this phone getting the account's alerts (account switch).
    await forgetThisDevice(getApiClient()).catch(() => undefined);
    await provider.signOut();
    signedInBefore.current = false;
    setState({ status: 'unauthenticated', reason: "You're signed out.", reasonKey: 'auth.signedOut' });
  }, [provider]);

  const setLocale = useCallback(
    (locale: UserLocale | null) =>
      setState((s) => (s.status === 'authenticated' ? { ...s, session: { ...s.session, user: { ...s.session.user, locale } } } : s)),
    [],
  );

  return (
    <SessionContext.Provider value={{ state, refresh, signIn: provider?.signIn ? signIn : null, signOut: provider?.signOut ? signOut : null, setLocale }}>
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

/** The session, or null outside <SessionProvider> (component tests, previews). */
export function useOptionalSessionState(): SessionContextValue | null {
  return useContext(SessionContext);
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
