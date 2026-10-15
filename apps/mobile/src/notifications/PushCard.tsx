import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { pushView, type PushState } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, Card, colors, font, ListRow, ListSection, LoadingState, SystemBanner, type } from '@/ui';
import { disablePush, enablePush, permissionStatus, refreshPushRegistration } from './push';

/**
 * This phone's push status with the one action that fits it.
 * - `variant="prompt"`: the ask after a Hunt goes live. Renders nothing once enabled or dismissed,
 *   and checks the current state WITHOUT prompting.
 * - `variant="settings"`: always shown, as a grouped section (Account > Notifications).
 */
export function PushCard({ variant }: { variant: 'prompt' | 'settings' }) {
  const [state, setState] = useState<PushState>({ status: 'checking' });
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const t = useT();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Check only: refresh registers silently if already allowed; it never asks.
      void permissionStatus().then(async (p) => {
        const next: PushState = p.status === 'granted' ? await refreshPushRegistration(getApiClient()) : p.status === 'denied' ? { status: 'denied', canAskAgain: p.canAskAgain } : { status: 'undetermined' };
        if (!cancelled) setState(next);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const view = pushView(state, t);
  if (!view) {
    return variant === 'settings' ? (
      <ListSection title={t('account.pushTitle')}>
        <View style={styles.inset}>
          <LoadingState label={t('push.checking')} />
        </View>
      </ListSection>
    ) : null;
  }
  if (variant === 'prompt') {
    // Turned on from this prompt: confirm it. Already on, unavailable or "Not now": stay out of the way.
    if (state.status === 'enabled') return justEnabled ? <SystemBanner tone="success" title={view.title} message={view.body} /> : null;
    if (dismissed || state.status === 'unavailable') return null;
  }

  const act = async () => {
    setBusy(true);
    const api = getApiClient();
    try {
      if (view.action === 'enable') {
        const next = await enablePush(api);
        setJustEnabled(next.status === 'enabled');
        setState(next);
      } else if (view.action === 'disable' && state.status === 'enabled') setState(await disablePush(api, state.deviceId));
      else if (view.action === 'open_settings') await Linking.openSettings();
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'settings') {
    return (
      <ListSection title={t('account.pushTitle')}>
        <ListRow title={view.title} subtitle={view.body} last={!view.action} />
        {view.action && (
          <ListRow
            title={view.actionLabel ?? ''}
            destructive={view.action === 'disable'}
            onPress={busy ? undefined : () => void act()}
            trailing={busy ? <ActivityIndicator color={colors.text} /> : undefined}
            chevron={view.action === 'open_settings'}
            last
          />
        )}
      </ListSection>
    );
  }

  return (
    <Card title={view.title}>
      <View style={styles.stack}>
        <Text style={[styles.body, font('regular')]}>{view.body}</Text>
        <View style={styles.actions}>
          {view.action && (
            <Button size="small" variant={view.action === 'disable' ? 'secondary' : 'primary'} loading={busy} onPress={act}>
              {view.actionLabel ?? ''}
            </Button>
          )}
          {view.canDismiss && (
            <Button size="small" variant="text" onPress={() => setDismissed(true)} disabled={busy}>
              {t('push.notNow')}
            </Button>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  body: { color: colors.textMuted, fontSize: type.callout, lineHeight: 20 },
  inset: { padding: 14, backgroundColor: colors.background },
});
