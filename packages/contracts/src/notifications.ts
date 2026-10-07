import { z } from 'zod';
import { idSchema, isoDateTimeSchema, pageSchema } from './common.js';

/**
 * Notifications (App Flow Blueprint section 17): an Alert is one intended notification; each
 * channel's attempt is a delivery. Preferences are per (category, channel). Service alerts (deals,
 * operational) and marketing are separate groups: marketing is opt-in only and never shown in-app.
 */

/** Mirrors the AlertChannel database enum (checked by a test in apps/api). */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'PUSH', 'EMAIL'] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Mirrors the DeliveryStatus database enum (checked by a test in apps/api). */
export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'SIMULATED', 'SKIPPED', 'FAILED'] as const;
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const NOTIFICATION_CATEGORIES = ['deal_alerts', 'exceptional_deals', 'operational', 'weekly_insight', 'marketing'] as const;
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/** alerts = service notifications about the user's own Hunts; marketing never mixes with them. */
export type NotificationGroup = 'alerts' | 'insights' | 'marketing';

/**
 * How a channel behaves for a category:
 * - always: on, can't be turned off (the in-app inbox is the record of what Rein Drop flagged);
 * - never: not offered (marketing is never in the inbox);
 * - optional: the user chooses; `default` applies until they do.
 */
export type ChannelRule = { mode: 'always' } | { mode: 'never' } | { mode: 'optional'; default: boolean };

export interface CategoryRule {
  group: NotificationGroup;
  channels: Record<NotificationChannel, ChannelRule>;
}

const on = { mode: 'optional', default: true } as const;
const off = { mode: 'optional', default: false } as const;

/**
 * Defaults. TODO(product): confirm (decision 0006). Marketing and the weekly insight are opt-in.
 * Push / email reach the user only once those channels exist (Expo push: Build Prompt 25).
 */
export const NOTIFICATION_RULES: Record<NotificationCategory, CategoryRule> = {
  deal_alerts: { group: 'alerts', channels: { IN_APP: { mode: 'always' }, PUSH: on, EMAIL: off } },
  exceptional_deals: { group: 'alerts', channels: { IN_APP: { mode: 'always' }, PUSH: on, EMAIL: off } },
  operational: { group: 'alerts', channels: { IN_APP: { mode: 'always' }, PUSH: on, EMAIL: off } },
  weekly_insight: { group: 'insights', channels: { IN_APP: { mode: 'never' }, PUSH: off, EMAIL: off } },
  marketing: { group: 'marketing', channels: { IN_APP: { mode: 'never' }, PUSH: off, EMAIL: off } },
};

export interface StoredPreference {
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Whether a channel is on for a category, given the user's stored choices (unknown rows ignored). */
export function channelEnabled(category: NotificationCategory, channel: NotificationChannel, stored: readonly StoredPreference[]): boolean {
  const rule = NOTIFICATION_RULES[category].channels[channel];
  if (rule.mode !== 'optional') return rule.mode === 'always';
  return stored.find((p) => p.category === category && p.channel === channel)?.enabled ?? rule.default;
}

export type DeliveryPlanItem = { channel: NotificationChannel; deliver: true } | { channel: NotificationChannel; deliver: false; reason: 'disabled_by_preference' };

/**
 * What to do on each offered channel for a new alert. Channels a category never uses are left out
 * (no delivery row); turned-off ones are recorded as skipped, so the log explains every outcome.
 */
export function deliveryPlan(category: NotificationCategory, stored: readonly StoredPreference[]): DeliveryPlanItem[] {
  return NOTIFICATION_CHANNELS.filter((c) => NOTIFICATION_RULES[category].channels[c].mode !== 'never').map((channel) =>
    channelEnabled(category, channel, stored) ? { channel, deliver: true } : { channel, deliver: false, reason: 'disabled_by_preference' },
  );
}

// ---------------------------------------------------------------------------
// Preferences API
// ---------------------------------------------------------------------------

const channelSettingSchema = z.object({
  /** Offered for this category at all. */
  available: z.boolean(),
  enabled: z.boolean(),
  /** False for "always" / "never" channels. */
  editable: z.boolean(),
});

/** `GET /me/notification-preferences`. */
export const notificationPreferencesSchema = z.object({
  categories: z.array(
    z.object({
      category: notificationCategorySchema,
      group: z.enum(['alerts', 'insights', 'marketing']),
      channels: z.object({ IN_APP: channelSettingSchema, PUSH: channelSettingSchema, EMAIL: channelSettingSchema }),
    }),
  ),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export function toNotificationPreferences(stored: readonly StoredPreference[]): NotificationPreferences {
  return {
    categories: NOTIFICATION_CATEGORIES.map((category) => {
      const setting = (channel: NotificationChannel) => {
        const rule = NOTIFICATION_RULES[category].channels[channel];
        return { available: rule.mode !== 'never', enabled: channelEnabled(category, channel, stored), editable: rule.mode === 'optional' };
      };
      return {
        category,
        group: NOTIFICATION_RULES[category].group,
        channels: { IN_APP: setting('IN_APP'), PUSH: setting('PUSH'), EMAIL: setting('EMAIL') },
      };
    }),
  };
}

/** `PATCH /me/notification-preferences` - only editable (optional) channels may be changed. */
export const updateNotificationPreferencesRequestSchema = z
  .object({
    changes: z
      .array(z.object({ category: notificationCategorySchema, channel: notificationChannelSchema, enabled: z.boolean() }))
      .min(1)
      .max(NOTIFICATION_CATEGORIES.length * NOTIFICATION_CHANNELS.length),
  })
  .superRefine((req, ctx) => {
    req.changes.forEach((c, i) => {
      if (NOTIFICATION_RULES[c.category].channels[c.channel].mode !== 'optional') {
        ctx.addIssue({ code: 'custom', path: ['changes', i, 'channel'], message: `${c.channel} can't be changed for ${c.category}` });
      }
    });
  });
export type UpdateNotificationPreferencesRequest = z.infer<typeof updateNotificationPreferencesRequestSchema>;

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** An inbox entry. `GET /alerts`. */
export const alertSchema = z.object({
  id: idSchema,
  category: notificationCategorySchema,
  title: z.string(),
  body: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable(),
  /** Deal to open (HuntMatch id), when the alert is about one. */
  dealId: idSchema.nullable(),
  huntId: idSchema.nullable(),
});
export type Alert = z.infer<typeof alertSchema>;

export const alertPageSchema = pageSchema(alertSchema).extend({ unreadCount: z.number().int().nonnegative() });
export type AlertPage = z.infer<typeof alertPageSchema>;

export const listAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Last id of the previous page (ids are time-ordered). */
  cursor: idSchema.optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type ListAlertsQueryInput = z.input<typeof listAlertsQuerySchema>;

export const markAllAlertsReadResponseSchema = z.object({ updated: z.number().int().nonnegative() });

// ---------------------------------------------------------------------------
// Development notification log (simulator)
// ---------------------------------------------------------------------------

/** `GET /dev/notifications` - DEVELOPMENT ONLY (404 in production). The caller's latest deliveries. */
export const notificationLogSchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      alertId: idSchema,
      category: notificationCategorySchema,
      title: z.string(),
      channel: notificationChannelSchema,
      status: deliveryStatusSchema,
      provider: z.string().nullable(),
      reason: z.string().nullable(),
      attempts: z.number().int(),
      createdAt: isoDateTimeSchema,
      sentAt: isoDateTimeSchema.nullable(),
    }),
  ),
});
export type NotificationLog = z.infer<typeof notificationLogSchema>;

// ---------------------------------------------------------------------------
// Push devices
// ---------------------------------------------------------------------------

/**
 * expo = an Expo push token from a development / store build.
 * dev_simulated = DEVELOPMENT ONLY: Expo Go can't receive push (SDK 53+), so it registers a
 * stable simulated token and the worker simulates the push. The API refuses it in production.
 */
export const PUSH_DEVICE_PROVIDERS = ['expo', 'dev_simulated'] as const;
export const pushDeviceProviderSchema = z.enum(PUSH_DEVICE_PROVIDERS);
export type PushDeviceProvider = z.infer<typeof pushDeviceProviderSchema>;

export const PUSH_PLATFORMS = ['ios', 'android'] as const;

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/;
const DEV_SIMULATED_TOKEN = /^dev-simulated:[0-9a-f-]{36}$/;

/** `POST /me/push-devices` - register or refresh this phone. */
export const registerPushDeviceRequestSchema = z
  .object({
    provider: pushDeviceProviderSchema,
    token: z.string().trim().min(1).max(255),
    platform: z.enum(PUSH_PLATFORMS),
    deviceName: z.string().trim().min(1).max(100).nullable().optional(),
    appVersion: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .superRefine((req, ctx) => {
    const ok = req.provider === 'expo' ? EXPO_TOKEN.test(req.token) : DEV_SIMULATED_TOKEN.test(req.token);
    if (!ok) ctx.addIssue({ code: 'custom', path: ['token'], message: `Not a valid ${req.provider} push token` });
  });
export type RegisterPushDeviceRequest = z.infer<typeof registerPushDeviceRequestSchema>;

export const pushDeviceSchema = z.object({
  id: idSchema,
  provider: pushDeviceProviderSchema,
  platform: z.enum(PUSH_PLATFORMS),
  deviceName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
  /** False once unregistered or rejected by the push service. */
  active: z.boolean(),
  disabledReason: z.string().nullable(),
});
export type PushDevice = z.infer<typeof pushDeviceSchema>;

export const pushDeviceListSchema = z.object({ items: z.array(pushDeviceSchema) });
