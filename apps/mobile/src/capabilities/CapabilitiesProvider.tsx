import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { capabilitiesFor, type Capability, type FeatureKey } from '@rein-drop/api-client';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';

/**
 * What this app may show (decision 0018), from the ONE shared feature list in contracts. Until the
 * server answers (`GET /me/capabilities?platform=mobile` - real rollout flags and plan), the
 * default is the same list evaluated locally with every rollout flag OFF and no entitlements: a
 * flagged or entitlement-gated feature can only appear once the server says so. Developer tools
 * follow the build (__DEV__).
 */
export const OFFLINE_CAPABILITIES = capabilitiesFor({
  platform: 'mobile',
  flags: [],
  entitlements: null,
  environment: __DEV__ ? 'development' : 'production',
});

const CapabilitiesContext = createContext<Record<FeatureKey, Capability>>(OFFLINE_CAPABILITIES);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const { state } = useSessionState();
  const [caps, setCaps] = useState(OFFLINE_CAPABILITIES);
  const userId = state.status === 'authenticated' ? state.session.user.userId : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getApiClient()
      .getCapabilities('mobile')
      .then(
        (server) => {
          if (cancelled) return;
          // Developer tools are a property of this build, not of the server's environment.
          setCaps({ ...server, 'dev.tools': OFFLINE_CAPABILITIES['dev.tools'] });
        },
        // Offline / older API: keep the safe default (flags off).
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <CapabilitiesContext.Provider value={caps}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): Record<FeatureKey, Capability> {
  return useContext(CapabilitiesContext);
}

/** True when the feature is available to this user in this app. */
export function useCan(feature: FeatureKey): boolean {
  return useCapabilities()[feature].available;
}
