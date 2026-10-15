import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getLocales } from 'expo-localization';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { ApiClient, PushDeviceProvider } from '@rein-drop/api-client';
import type { PushState } from '@rein-drop/client-core';
import { resolveLanguage, translator } from '@rein-drop/i18n';
import { loadNotifications } from './load-notifications';

/**
 * Push on this phone. Rules:
 * - Never ask for permission on launch: `enablePush` is only called from the "Hunt is live"
 *   prompt or Settings. On launch, `refreshPushRegistration` re-registers silently, and only if
 *   permission was already granted.
 * - Development device token flow: a development / store build registers a real Expo push token.
 *   Expo Go can't receive push (SDK 53+), so in development it registers a stable simulated
 *   token instead - the server simulates and logs those pushes - and the whole pipeline is
 *   testable without a development build. In Expo Go on Android expo-notifications can't even be
 *   loaded, so there is no OS prompt: turning it on is an in-app opt-in (development only).
 * - Every failure degrades to "alerts stay in your inbox"; nothing here throws to the UI.
 */

/** Must match ALERTS_CHANNEL_ID in the worker (Android notification channel). */
export const ALERTS_CHANNEL_ID = 'alerts';
const DEV_TOKEN_KEY = 'reindrop.devPushToken';
/** Development fallback without expo-notifications: the user's in-app "on" choice. */
const DEV_OPT_IN_KEY = 'reindrop.devPushOptIn';
/** The server id of this phone's registration for the signed-in account (removed again at sign-out). */
const DEVICE_ID_KEY = 'reindrop.pushDeviceId';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type TokenResult = { ok: true; provider: PushDeviceProvider; token: string } | { ok: false; state: PushState };
type Permission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

export async function permissionStatus(): Promise<Permission> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    // No OS permission here; in development the in-app opt-in stands in for it.
    const optedIn = __DEV__ && (await AsyncStorage.getItem(DEV_OPT_IN_KEY).catch(() => null)) === 'yes';
    return { status: optedIn ? 'granted' : 'undetermined', canAskAgain: true };
  }
  try {
    const p = await Notifications.getPermissionsAsync();
    return { status: p.granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
  } catch {
    return { status: 'undetermined', canAskAgain: true };
  }
}

/** Asks (if needed) and registers this phone. Only call from an explicit user action. */
export async function enablePush(api: ApiClient): Promise<PushState> {
  if (Platform.OS === 'web') return { status: 'unavailable', reason: 'web' };
  try {
    const Notifications = loadNotifications();
    if (!Notifications) {
      if (!__DEV__) return { status: 'unavailable', reason: 'no_project_id' };
      await AsyncStorage.setItem(DEV_OPT_IN_KEY, 'yes').catch(() => undefined);
      return await register(api);
    }
    await ensureAlertsChannel();
    let permission = await permissionStatus();
    if (permission.status !== 'granted' && permission.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      permission = { status: asked.granted ? 'granted' : 'denied', canAskAgain: asked.canAskAgain };
    }
    if (permission.status !== 'granted') return { status: 'denied', canAskAgain: permission.canAskAgain };
    return await register(api);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Launch: re-register silently if (and only if) permission is already granted. Never prompts. */
export async function refreshPushRegistration(api: ApiClient): Promise<PushState> {
  if (Platform.OS === 'web') return { status: 'unavailable', reason: 'web' };
  const permission = await permissionStatus();
  if (permission.status === 'undetermined') return { status: 'undetermined' };
  if (permission.status === 'denied') return { status: 'denied', canAskAgain: permission.canAskAgain };
  try {
    await ensureAlertsChannel();
    return await register(api);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Stops push to this phone on the server (OS permission stays as the user set it). */
export async function disablePush(api: ApiClient, deviceId: string): Promise<PushState> {
  try {
    await api.unregisterPushDevice(deviceId);
    await AsyncStorage.multiRemove([DEV_OPT_IN_KEY, DEVICE_ID_KEY]).catch(() => undefined);
    const permission = await permissionStatus();
    return permission.status === 'denied' ? { status: 'denied', canAskAgain: permission.canAskAgain } : { status: 'undetermined' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

async function register(api: ApiClient): Promise<PushState> {
  const token = await obtainToken();
  if (!token.ok) return token.state;
  const device = await api.registerPushDevice({
    provider: token.provider,
    token: token.token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    deviceName: Device.deviceName ?? Device.modelName ?? null,
    appVersion: Constants.expoConfig?.version ?? null,
  });
  await AsyncStorage.setItem(DEVICE_ID_KEY, device.id).catch(() => undefined);
  return { status: 'enabled', deviceId: device.id, simulated: device.provider === 'dev_simulated' };
}

/**
 * Sign-out / account switch: stop this phone receiving the signed-out account's alerts. Call while
 * the session is still valid. Best effort - sign-out never waits on the network failing.
 */
export async function forgetThisDevice(api: ApiClient): Promise<void> {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (deviceId) await api.unregisterPushDevice(deviceId).catch(() => undefined);
  await AsyncStorage.multiRemove([DEVICE_ID_KEY, DEV_OPT_IN_KEY]).catch(() => undefined);
}

async function obtainToken(): Promise<TokenResult> {
  const Notifications = loadNotifications();
  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  // Expo Go (SDK 53+) can't receive push; neither can a simulator; a build without an EAS project
  // can't get a token. Development falls back to a simulated token so the server side still works.
  if (!Notifications || isExpoGo || !Device.isDevice || !projectId) {
    if (__DEV__) return { ok: true, provider: 'dev_simulated', token: await devToken() };
    return { ok: false, state: { status: 'unavailable', reason: !Device.isDevice ? 'not_a_device' : 'no_project_id' } };
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { ok: true, provider: 'expo', token: data };
}

/** Stable per install, so re-registering refreshes the same device instead of adding one. */
async function devToken(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEV_TOKEN_KEY).catch(() => null);
  if (stored && /^dev-simulated:[0-9a-f-]{36}$/.test(stored)) return stored;
  const token = `dev-simulated:${uuidV4()}`;
  await AsyncStorage.setItem(DEV_TOKEN_KEY, token).catch(() => undefined);
  return token;
}

function uuidV4(): string {
  const hex = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

async function ensureAlertsChannel(): Promise<void> {
  const Notifications = loadNotifications();
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    // Shown in the phone's settings: in the phone's language (set once, when the channel is created).
    name: translator(resolveLanguage(getLocales()[0]?.languageTag))('push.channelName'),
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
}
