import type { Alert, NotificationCategory, NotificationChannel, NotificationGroup, NotificationPreferences } from '@rein-drop/contracts';
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import { ageText } from './deal-view.js';

/**
 * Notification settings + inbox copy, shared by web and mobile. Service alerts (about the user's
 * own Hunts) and marketing are always shown as separate sections.
 */

export const NOTIFICATION_GROUP_COPY: Record<NotificationGroup, { title: string; description: string }> = {
  alerts: {
    title: 'Alerts about your Hunts',
    description: 'Rein Drop only alerts you when something clears your criteria and its own bar. Every alert stays in your inbox.',
  },
  insights: { title: 'Insights', description: 'Optional summaries of how your reselling is going.' },
  marketing: { title: 'News and offers', description: 'Separate from your alerts, and off unless you turn it on.' },
};

export const NOTIFICATION_CATEGORY_COPY: Record<NotificationCategory, { title: string; description: string }> = {
  deal_alerts: { title: 'Deal alerts', description: 'A listing that looks worth acting on.' },
  exceptional_deals: { title: 'Exceptional deals', description: 'The rare, much stronger opportunities.' },
  operational: { title: 'Hunt and source issues', description: 'When a marketplace problem or a Hunt setting stops Rein Drop from watching properly.' },
  weekly_insight: { title: 'Weekly insight', description: 'Buys, sells, profit and one useful suggestion. Coming later.' },
  marketing: { title: 'Product news and offers', description: 'Occasional news about Rein Drop.' },
};

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = { IN_APP: 'Inbox', PUSH: 'Push', EMAIL: 'Email' };

/** Shown under the settings: push / email aren't connected to real providers yet. */
export const NOTIFICATION_CHANNELS_NOTE =
  'Push and email are saved now and start arriving once they are connected. In development they are simulated and logged.';

type Copy = { title: string; description: string };
const GROUP_KEYS: Record<NotificationGroup, [MessageKey, MessageKey]> = {
  alerts: ['notifications.groupAlertsTitle', 'notifications.groupAlertsDescription'],
  insights: ['notifications.groupInsightsTitle', 'notifications.groupInsightsDescription'],
  marketing: ['notifications.groupMarketingTitle', 'notifications.groupMarketingDescription'],
};
const CATEGORY_KEYS: Record<NotificationCategory, [MessageKey, MessageKey]> = {
  deal_alerts: ['notifications.categoryDealAlertsTitle', 'notifications.categoryDealAlertsDescription'],
  exceptional_deals: ['notifications.categoryExceptionalTitle', 'notifications.categoryExceptionalDescription'],
  operational: ['notifications.categoryOperationalTitle', 'notifications.categoryOperationalDescription'],
  weekly_insight: ['notifications.categoryWeeklyTitle', 'notifications.categoryWeeklyDescription'],
  marketing: ['notifications.categoryMarketingTitle', 'notifications.categoryMarketingDescription'],
};
const CHANNEL_KEY: Record<NotificationChannel, MessageKey> = { IN_APP: 'notifications.channelInbox', PUSH: 'notifications.channelPush', EMAIL: 'notifications.channelEmail' };

const copyOf = ([title, description]: [MessageKey, MessageKey], t: Translator): Copy => ({ title: t(title), description: t(description) });

/** Group copy in the UI language. Use this; the English NOTIFICATION_GROUP_COPY will be removed in step 89. */
export function notificationGroupCopy(group: NotificationGroup, t: Translator): Copy {
  return copyOf(GROUP_KEYS[group], t);
}
/** Category copy in the UI language. Use this; the English NOTIFICATION_CATEGORY_COPY will be removed in step 89. */
export function notificationCategoryCopy(category: NotificationCategory, t: Translator): Copy {
  return copyOf(CATEGORY_KEYS[category], t);
}
/** Channel label in the UI language. Use this; the English NOTIFICATION_CHANNEL_LABEL will be removed in step 89. */
export function notificationChannelLabel(channel: NotificationChannel, t: Translator): string {
  return t(CHANNEL_KEY[channel]);
}
/** The channels note in the UI language. Use this; the English NOTIFICATION_CHANNELS_NOTE will be removed in step 89. */
export function notificationChannelsNote(t: Translator): string {
  return t('notifications.channelsNote');
}

export interface PreferenceSection {
  group: NotificationGroup;
  title: string;
  description: string;
  categories: {
    category: NotificationCategory;
    title: string;
    description: string;
    channels: { channel: NotificationChannel; label: string; enabled: boolean; editable: boolean }[];
  }[];
}

/** Preferences grouped for display (alerts, insights, marketing), unavailable channels left out. */
export function preferenceSections(prefs: NotificationPreferences, t: Translator = translator('en')): PreferenceSection[] {
  const groups: NotificationGroup[] = ['alerts', 'insights', 'marketing'];
  return groups.map((group) => ({
    group,
    ...notificationGroupCopy(group, t),
    categories: prefs.categories
      .filter((c) => c.group === group)
      .map((c) => ({
        category: c.category,
        ...notificationCategoryCopy(c.category, t),
        channels: (['IN_APP', 'PUSH', 'EMAIL'] as const)
          .filter((ch) => c.channels[ch].available)
          .map((ch) => ({ channel: ch, label: notificationChannelLabel(ch, t), enabled: c.channels[ch].enabled, editable: c.channels[ch].editable })),
      })),
  }));
}

/** Apply one toggle locally (optimistic UI) - the server's answer replaces it. */
export function withPreference(prefs: NotificationPreferences, category: NotificationCategory, channel: NotificationChannel, enabled: boolean): NotificationPreferences {
  return {
    categories: prefs.categories.map((c) => (c.category === category ? { ...c, channels: { ...c.channels, [channel]: { ...c.channels[channel], enabled } } } : c)),
  };
}

export interface AlertView {
  id: string;
  title: string;
  body: string | null;
  when: string;
  unread: boolean;
  /** Where opening it goes (web path; mobile maps it to its route). */
  dealId: string | null;
  kindLabel: string;
  exceptional: boolean;
}

/** The alert's own title and body come from the server as they were sent. */
export function alertView(alert: Alert, now: Date = new Date(), t: Translator = translator('en')): AlertView {
  return {
    id: alert.id,
    title: alert.title,
    body: alert.body,
    when: ageText(Math.max(0, Math.floor((now.getTime() - Date.parse(alert.createdAt)) / 60_000)), t),
    unread: alert.readAt === null,
    dealId: alert.dealId,
    kindLabel: notificationCategoryCopy(alert.category, t).title,
    exceptional: alert.category === 'exceptional_deals',
  };
}

/** "3 unread" / "All caught up". */
export function unreadText(count: number, t: Translator = translator('en')): string {
  return t('notifications.unread', { count });
}
