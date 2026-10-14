import { useEffect, useState } from 'react';
import type { GeoConfig, UserArea } from '@rein-drop/api-client';
import { getApiClient } from '@/config/api';

/** No suggestions, no map: the fallback while loading or when the API can't say. */
export const NO_GEO: GeoConfig = { provider: 'none', suggestions: false, tiles: null, attribution: null };

/**
 * Place / map features and the user's area for a location form (decision 0017). Never blocks the
 * form: until loaded (or on failure) the field is plain text.
 */
export function useLocationSupport(): { geo: GeoConfig; area: UserArea | null; setArea: (area: UserArea | null) => void } {
  const [geo, setGeo] = useState<GeoConfig>(NO_GEO);
  const [area, setArea] = useState<UserArea | null>(null);
  useEffect(() => {
    let cancelled = false;
    const api = getApiClient();
    void Promise.all([api.getGeoConfig().catch(() => NO_GEO), api.getMyArea().catch(() => null)]).then(([g, a]) => {
      if (cancelled) return;
      setGeo(g);
      setArea(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { geo, area, setArea };
}
