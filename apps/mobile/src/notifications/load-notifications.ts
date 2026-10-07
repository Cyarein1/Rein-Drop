import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications, loaded on demand - never imported at module level. In Expo Go on Android
 * (SDK 53+) merely loading it throws ("remote notifications functionality ... was removed from
 * Expo Go"), which would break every screen that imports it. There (and on web) this returns null
 * and callers fall back: no OS prompt, no token - development uses the simulated device flow.
 */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  const expoGoAndroid = Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android';
  if (expoGoAndroid || Platform.OS === 'web') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
