import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SourceHealth } from '@rein-drop/api-client';
import { sourceBanner } from '@rein-drop/client-core';
import { getApiClient } from '@/config/api';
import { SystemBanner } from '@/ui';

/**
 * Calm status when a marketplace source is degraded while others continue (Screenbook frame 31).
 * Renders nothing when every source is working. Never an error banner.
 */
export function SourceBanner({ sources, now }: { sources: readonly SourceHealth[] | null; now: Date }) {
  const banner = sources ? sourceBanner(sources, now) : null;
  if (!banner) return null;
  return <SystemBanner tone={banner.tone} title={banner.title} message={banner.message} />;
}

/** Loads source health itself (refreshed on focus); a failed load just shows nothing. */
export function LiveSourceBanner() {
  const [state, setState] = useState<{ items: SourceHealth[]; at: Date } | null>(null);
  const load = useCallback(() => {
    let cancelled = false;
    getApiClient()
      .getSourceHealth()
      .then(
        (r) => !cancelled && setState({ items: r.items, at: new Date(r.generatedAt) }),
        () => !cancelled && setState(null),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);
  return <SourceBanner sources={state?.items ?? null} now={state?.at ?? new Date(0)} />;
}
