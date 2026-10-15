import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { NotificationCategory, NotificationChannel, NotificationPreferences } from '@rein-drop/api-client';
import { notificationChannelsNote, preferenceSections, withPreference } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { SwitchRow } from '@/components/SettingsRows';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { PushCard } from '@/notifications/PushCard';
import { colors, font, ListSection, LoadingState, Screen, SystemBanner, type } from '@/ui';

/**
 * Account > Notifications: this phone's push status, then the choices per category and channel
 * (Screenbook frame 28). Alerts, insights and marketing are separate groups; marketing is opt-in.
 * Each switch saves on its own.
 */
export default function NotificationsSettingsScreen() {
  return (
    <SessionGate>
      <NotificationsSettings />
    </SessionGate>
  );
}

function NotificationsSettings() {
  const t = useT();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.resolve()
        .then(() => getApiClient().getNotificationPreferences())
        .then(
          (p) => !cancelled && (setPrefs(p), setFailed(false)),
          () => !cancelled && setFailed(true),
        );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggle = async (category: NotificationCategory, channel: NotificationChannel, enabled: boolean) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs(withPreference(prefs, category, channel, enabled));
    setSaving(`${category}:${channel}`);
    setStatus(null);
    try {
      setPrefs(await getApiClient().updateNotificationPreferences({ changes: [{ category, channel, enabled }] }));
      setStatus({ error: false, text: t('account.prefsSaved') });
    } catch (err) {
      setPrefs(before);
      setStatus({ error: true, text: t('account.prefsFailed', { message: err instanceof Error ? err.message : String(err) }) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen variant="grouped">
      <Stack.Screen options={{ title: t('account.notificationsTitle') }} />
      <PushCard variant="settings" />
      {failed && !prefs && <SystemBanner tone="error" title={t('account.prefsLoadFailed')} message={t('account.reopenToRetry')} />}
      {!failed && !prefs && <LoadingState label={t('account.prefsLoading')} />}
      {status && (
        <Text style={[styles.status, status.error && styles.error, font('medium')]} accessibilityLiveRegion="polite">
          {status.text}
        </Text>
      )}
      {prefs &&
        preferenceSections(prefs, t).map((section) => (
          <View key={section.group} style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={[styles.groupTitle, font('bold')]} accessibilityRole="header">
                {section.title}
              </Text>
              <Text style={[styles.groupBody, font('regular')]}>{section.description}</Text>
            </View>
            {section.categories.map((c) => (
              <ListSection key={c.category} title={c.title} footer={c.description}>
                {c.channels.map((ch, i) => (
                  <SwitchRow
                    key={ch.channel}
                    title={ch.editable ? ch.label : t('account.alwaysOn', { label: ch.label })}
                    value={ch.enabled}
                    disabled={!ch.editable || saving === `${c.category}:${ch.channel}`}
                    onChange={(v) => void toggle(c.category, ch.channel, v)}
                    accessibilityLabel={t('account.labelValue', { label: c.title, value: ch.label })}
                    last={i === c.channels.length - 1}
                  />
                ))}
              </ListSection>
            ))}
          </View>
        ))}
      {prefs && <Text style={[styles.note, font('regular')]}>{notificationChannelsNote(t)}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[4] },
  groupHead: { gap: 2, marginHorizontal: 4 },
  groupTitle: { color: colors.text, fontSize: type.headline },
  groupBody: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
  status: { color: colors.text, fontSize: type.subhead, marginHorizontal: 4 },
  error: { color: colors.lossText },
  note: { color: colors.textMuted, fontSize: type.footnote, marginHorizontal: 4, lineHeight: 17 },
});
