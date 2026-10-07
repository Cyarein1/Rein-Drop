import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ApiClient, PushDeviceProvider } from '@rein-drop/api-client';
import type { PushState } from '@rein-drop/client-core';

/**
 * Push on this phone. Rules:
 * - Never ask for permission on launch: `enablePush` is only called from the "Hunt is live"
 *   prompt or Settings. On launch, `refreshPushRegistration` re-registers silently, and only if
 *   permission was already granted.
 * - Development device token flow: a development / store build registers a real Expo push token.
 *   Expo Go can't receive push (SDK 53+), so in development it registers a stable simulated
 *   token instead - the server simulates and logs those pushes - and the whole pipeline is
 *   testable without a dev build.
 * - Every failure degrades to "alerts stay in your inbox"; nothing here throws to the UI.
 */

/** Must match ALERTS_CHANNEL_ID in the worker (Android notification channel). */
export const ALERTS_CHANNEL_ID = 'alerts';
const DEV_TOKEN_KEY = 'reindrop.devPushToken';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type TokenResult = { ok: true; provider: PushDeviceProvider; token: string } | { ok: false; state: PushState };

export async function permissionStatus(): Promise<{ status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean }> {
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

/** Stops push to this phone on the server (permission stays as the user set it). */
export async function disablePush(api: ApiClient, deviceId: string): Promise<PushState> {
  try {
    await api.unregisterPushDevice(deviceId);
    const permission = await permissionStatus();
    return permission.status === 'granted' ? { status: 'undetermined' } : { status: 'denied', canAskAgain: permission.canAskAgain };
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
  return { status: 'enabled', deviceId: device.id, simulated: device.provider === 'dev_simulated' };
}

async function obtainToken(): Promise<TokenResult> {
  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  // Expo Go (SDK 53+) can't receive push; neither can a simulator. Development falls back to a
  // simulated token so the server side can still be exercised.
  if (isExpoGo || !Device.isDevice || !projectId) {
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
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Deal alerts',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
}
