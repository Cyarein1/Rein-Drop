import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic additions to app.json. Only values that must not be committed live here.
 *
 * GOOGLE_MAPS_ANDROID_API_KEY (decision 0017): the Hunt map on Android uses Google Maps
 * (react-native-maps) and needs a Google Maps Platform key with billing, restricted to this app's
 * package + signing certificate. TODO(geo): the owner creates it; until then Android development /
 * release builds show an empty map (Expo Go works - it brings its own key; iPhone uses Apple Maps).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(key ? { config: { ...config.android?.config, googleMaps: { apiKey: key } } } : {}),
    },
  };
};
