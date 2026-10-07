"use server";

import { ApiError, type Alert, type NotificationCategory, type NotificationChannel, type NotificationPreferences } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Something went wrong. Please try again." };
  }
}

export async function readAlert(id: string): Promise<Result<Alert>> {
  const api = await getServerApiClient();
  return attempt(() => api.markAlertRead(id));
}

export async function readAllAlerts(): Promise<Result<{ updated: number }>> {
  const api = await getServerApiClient();
  return attempt(() => api.markAllAlertsRead());
}

export async function savePreference(
  category: NotificationCategory,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<Result<NotificationPreferences>> {
  const api = await getServerApiClient();
  return attempt(() => api.updateNotificationPreferences({ changes: [{ category, channel, enabled }] }));
}
