import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { pushView, type PushState } from '@rein-drop/client-core';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, Card, font, LoadingState, SystemBanner } from '@/ui';
import { disablePush, enablePush, permissionStatus, refreshPushRegistration } from './push';

/**
 * This phone's push status with the one action that fits it.
 * - `variant="prompt"`: the ask after a Hunt goes live. Renders nothing once enabled or dismissed,
 *   and checks the current state WITHOUT prompting.
 * - `variant="settings"`: always shown (Settings > Notifications on this phone).
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
  if (!view) return variant === 'settings' ? <LoadingState label={t('push.checking')} /> : null;
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
      }
      else if (view.action === 'disable' && state.status === 'enabled') setState(await disablePush(api, state.deviceId));
      else if (view.action === 'open_settings') await Linking.openSettings();
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <View style={styles.stack}>
      <Text style={[styles.body, font('regular')]}>{view.body}</Text>
      <View style={styles.actions}>
        {view.action && (
          <Button variant={view.action === 'disable' ? 'secondary' : 'primary'} loading={busy} onPress={act}>
            {view.actionLabel ?? ''}
          </Button>
        )}
        {variant === 'prompt' && view.canDismiss && (
          <Button variant="text" onPress={() => setDismissed(true)} disabled={busy}>
            {t('push.notNow')}
          </Button>
        )}
      </View>
    </View>
  );
  return variant === 'prompt' ? (
    <Card title={view.title}>{body}</Card>
  ) : (
    <View style={styles.stack} accessibilityLabel={t('push.sectionLabel')}>
      <Text style={[styles.heading, font('semibold')]}>{view.title}</Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  heading: { color: roles.text, fontSize: fontSize.md },
  body: { color: roles.textMuted, fontSize: fontSize.sm },
});
