import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic additions to app.json. Only values that must not be committed (or aren't decided yet)
 * live here - nothing is invented: each is applied only when its variable is set.
 *
 * GOOGLE_MAPS_ANDROID_API_KEY (decision 0017): the Hunt map on Android uses Google Maps
 * (react-native-maps) and needs a Google Maps Platform key with billing, restricted to this app's
 * package + signing certificate. TODO(geo): the owner creates it; until then Android development /
 * release builds show an empty map (Expo Go works - it brings its own key; iPhone uses Apple Maps).
 *
 * Push notifications (docs/PUSH_NOTIFICATIONS.md), set by the owner:
 * - EAS_PROJECT_ID: from `eas init`; Expo push tokens need it (without it, development falls back to
 *   the simulated device flow and release builds can't register for push).
 * - APP_BUNDLE_ID: iOS bundle identifier and Android package (e.g. "com.yourcompany.reindrop") -
 *   permanent once published to a store.
 * - GOOGLE_SERVICES_FILE: path to google-services.json from Firebase (Android push via FCM v1).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const appId = process.env.APP_BUNDLE_ID?.trim();
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE?.trim();
  return {
    ...(config as ExpoConfig),
    ...(projectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } } : {}),
    ios: {
      ...config.ios,
      ...(appId ? { bundleIdentifier: appId } : {}),
    },
    android: {
      ...config.android,
      ...(appId ? { package: appId } : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(mapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
  };
};
