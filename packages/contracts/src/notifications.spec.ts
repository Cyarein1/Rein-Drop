import { describe, expect, it } from 'vitest';
import {
  channelEnabled,
  deliveryPlan,
  NOTIFICATION_RULES,
  toNotificationPreferences,
  updateNotificationPreferencesRequestSchema,
} from './notifications.js';

describe('notification preferences', () => {
  it('defaults: service alerts in-app always + push on; email, weekly insight and marketing opt-in', () => {
    expect(deliveryPlan('deal_alerts', [])).toEqual([
      { channel: 'IN_APP', deliver: true },
      { channel: 'PUSH', deliver: true },
      { channel: 'EMAIL', deliver: false, reason: 'disabled_by_preference' },
    ]);
    expect(deliveryPlan('marketing', [])).toEqual([
      { channel: 'PUSH', deliver: false, reason: 'disabled_by_preference' },
      { channel: 'EMAIL', deliver: false, reason: 'disabled_by_preference' },
    ]);
    expect(channelEnabled('weekly_insight', 'EMAIL', [])).toBe(false);
  });

  it('stored choices win for optional channels; in-app can never be turned off for alerts', () => {
    const stored = [
      { category: 'deal_alerts', channel: 'PUSH' as const, enabled: false },
      { category: 'deal_alerts', channel: 'IN_APP' as const, enabled: false },
      { category: 'marketing', channel: 'EMAIL' as const, enabled: true },
    ];
    expect(deliveryPlan('deal_alerts', stored)).toEqual([
      { channel: 'IN_APP', deliver: true },
      { channel: 'PUSH', deliver: false, reason: 'disabled_by_preference' },
      { channel: 'EMAIL', deliver: false, reason: 'disabled_by_preference' },
    ]);
    expect(channelEnabled('marketing', 'EMAIL', stored)).toBe(true);
    // Marketing choices never affect service alerts.
    expect(channelEnabled('exceptional_deals', 'EMAIL', stored)).toBe(false);
  });

  it('marketing is its own group, never in the inbox', () => {
    expect(NOTIFICATION_RULES.marketing.group).toBe('marketing');
    const prefs = toNotificationPreferences([]);
    const marketing = prefs.categories.find((c) => c.category === 'marketing')!;
    expect(marketing.channels.IN_APP).toEqual({ available: false, enabled: false, editable: false });
    const deals = prefs.categories.find((c) => c.category === 'deal_alerts')!;
    expect(deals).toMatchObject({ group: 'alerts', channels: { IN_APP: { available: true, enabled: true, editable: false }, PUSH: { enabled: true, editable: true } } });
  });

  it('only optional channels can be changed', () => {
    expect(updateNotificationPreferencesRequestSchema.safeParse({ changes: [{ category: 'marketing', channel: 'EMAIL', enabled: true }] }).success).toBe(true);
    const locked = updateNotificationPreferencesRequestSchema.safeParse({ changes: [{ category: 'deal_alerts', channel: 'IN_APP', enabled: false }] });
    expect(locked.success).toBe(false);
    expect(locked.error!.issues[0]!.path).toEqual(['changes', 0, 'channel']);
    expect(updateNotificationPreferencesRequestSchema.safeParse({ changes: [] }).success).toBe(false);
  });
});
