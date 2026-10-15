import { describe, expect, it } from 'vitest';
import { toNotificationPreferences } from '@rein-drop/contracts';
import { translator } from '@rein-drop/i18n';
import {
  alertView,
  NOTIFICATION_GROUP_COPY,
  notificationChannelsNote,
  notificationGroupCopy,
  preferenceSections,
  unreadText,
  withPreference,
} from './notification-view.js';

describe('notification settings view', () => {
  it('groups alerts, insights and marketing separately; marketing has no inbox option', () => {
    const sections = preferenceSections(toNotificationPreferences([]));
    expect(sections.map((s) => s.group)).toEqual(['alerts', 'insights', 'marketing']);
    expect(sections[0]!.categories.map((c) => c.category)).toEqual(['deal_alerts', 'exceptional_deals', 'operational']);
    const deals = sections[0]!.categories[0]!;
    expect(deals.channels).toEqual([
      { channel: 'IN_APP', label: 'Inbox', enabled: true, editable: false },
      { channel: 'PUSH', label: 'Push', enabled: true, editable: true },
      { channel: 'EMAIL', label: 'Email', enabled: false, editable: true },
    ]);
    expect(sections[2]!.categories[0]!.channels.map((c) => c.channel)).toEqual(['PUSH', 'EMAIL']);
  });

  it('applies a toggle locally', () => {
    const prefs = withPreference(toNotificationPreferences([]), 'marketing', 'EMAIL', true);
    expect(prefs.categories.find((c) => c.category === 'marketing')!.channels.EMAIL.enabled).toBe(true);
    expect(prefs.categories.find((c) => c.category === 'deal_alerts')!.channels.EMAIL.enabled).toBe(false);
  });
});

describe('inbox view', () => {
  it('describes an alert and the unread count', () => {
    const view = alertView(
      { id: 'a', category: 'exceptional_deals', title: 'Exceptional deal: iPhone 13', body: null, createdAt: '2026-10-07T09:00:00.000Z', readAt: null, dealId: 'd', huntId: null },
      new Date('2026-10-07T10:30:00.000Z'),
    );
    expect(view).toMatchObject({ when: '1 h ago', unread: true, kindLabel: 'Exceptional deals', exceptional: true, dealId: 'd' });
    expect([unreadText(0), unreadText(3)]).toEqual(['All caught up', '3 unread']);
  });
});

describe('German (draft)', () => {
  const de = translator('de');
  it('settings sections, channels, inbox', () => {
    const sections = preferenceSections(toNotificationPreferences([]), de);
    expect(sections.map((s) => s.title)).toEqual(['Benachrichtigungen zu deinen Hunts', 'Auswertungen', 'Neuigkeiten und Angebote']);
    expect(sections[0]!.categories[0]!.channels.map((c) => c.label)).toEqual(['Posteingang', 'Push', 'E-Mail']);
    expect([unreadText(0, de), unreadText(3, de)]).toEqual(['Alles gelesen', '3 ungelesen']);
    expect(notificationChannelsNote(de)).toMatch(/simuliert/);
    // The English constants stay as they were until the apps switch (step 89).
    expect(notificationGroupCopy('alerts', translator('en'))).toEqual(NOTIFICATION_GROUP_COPY.alerts);
  });
});
