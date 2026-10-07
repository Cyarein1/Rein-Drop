import type { Alert, NotificationCategory, NotificationChannel, NotificationGroup, NotificationPreferences } from '@rein-drop/contracts';
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
export function preferenceSections(prefs: NotificationPreferences): PreferenceSection[] {
  const groups: NotificationGroup[] = ['alerts', 'insights', 'marketing'];
  return groups.map((group) => ({
    group,
    ...NOTIFICATION_GROUP_COPY[group],
    categories: prefs.categories
      .filter((c) => c.group === group)
      .map((c) => ({
        category: c.category,
        ...NOTIFICATION_CATEGORY_COPY[c.category],
        channels: (['IN_APP', 'PUSH', 'EMAIL'] as const)
          .filter((ch) => c.channels[ch].available)
          .map((ch) => ({ channel: ch, label: NOTIFICATION_CHANNEL_LABEL[ch], enabled: c.channels[ch].enabled, editable: c.channels[ch].editable })),
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

export function alertView(alert: Alert, now: Date = new Date()): AlertView {
  return {
    id: alert.id,
    title: alert.title,
    body: alert.body,
    when: ageText(Math.max(0, Math.floor((now.getTime() - Date.parse(alert.createdAt)) / 60_000))),
    unread: alert.readAt === null,
    dealId: alert.dealId,
    kindLabel: NOTIFICATION_CATEGORY_COPY[alert.category].title,
    exceptional: alert.category === 'exceptional_deals',
  };
}

/** "3 unread" / "All caught up". */
export function unreadText(count: number): string {
  return count === 0 ? 'All caught up' : `${count} unread`;
}
