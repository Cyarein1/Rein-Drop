import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NotificationCategory, NotificationChannel, NotificationPreferences, SellerSnapshot, UserLocale } from '@rein-drop/api-client';
import { huntFormContext, NOTIFICATION_CHANNELS_NOTE, preferenceSections, snapshotAnswerRows, withPreference } from '@rein-drop/client-core';
import { fontSize, roles, space, tones } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { Badge, Button, Card, font, LoadingState, Screen, SystemBanner } from '@/ui';

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; ready: boolean; database: string }
  | { state: 'error'; message: string };

const SOURCE_LABEL = {
  env: 'From EXPO_PUBLIC_API_BASE_URL',
  'dev-server-host': 'Auto-detected (dev machine)',
  none: 'Not configured',
} as const;

/** Not gated: reachable when signed out so the API address and session state can be inspected. */
export default function SettingsScreen() {
  const { state: sessionState, refresh } = useSessionState();
  const router = useRouter();
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const checkConnection = async () => {
    setCheck({ state: 'checking' });
    try {
      const client = getApiClient();
      await client.getHealth();
      const readiness = await client.getReadiness();
      setCheck({
        state: 'ok',
        ready: readiness.status === 'ready',
        database: readiness.checks.database,
      });
    } catch (err) {
      setCheck({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Screen>
      <PlaceholderNotice>Most settings sections are listed but not editable yet.</PlaceholderNotice>

      <Card
        title="Account"
        action={
          sessionState.status === 'authenticated' && sessionState.session.isDevelopment ? (
            <Badge tone="info">Development sign-in</Badge>
          ) : undefined
        }
      >
        {sessionState.status === 'loading' && <LoadingState label="Checking your session…" />}
        {sessionState.status === 'authenticated' && (
          <>
            <Text style={[styles.body, font('medium')]}>{sessionState.session.user.email}</Text>
            {sessionState.session.isDevelopment && (
              <Text style={[styles.muted, font('regular')]}>
                Signed in automatically as the seeded local user (development only).
              </Text>
            )}
            {/* TODO(auth): sign-out comes with the managed provider. */}
            <Button variant="secondary" disabled>
              Sign out
            </Button>
          </>
        )}
        {(sessionState.status === 'unauthenticated' || sessionState.status === 'error') && (
          <>
            <SystemBanner
              tone={sessionState.status === 'error' ? 'error' : 'warning'}
              title="Not signed in"
              message={sessionState.status === 'error' ? sessionState.message : sessionState.reason}
            />
            <Button variant="secondary" onPress={refresh}>
              Try again
            </Button>
          </>
        )}
      </Card>

      {sessionState.status === 'authenticated' ? (
        <SellerSnapshotCard locale={sessionState.session.user.locale} />
      ) : (
        <Card title="Seller Snapshot">
          <Text style={[styles.muted, font('regular')]}>Sign in to see your onboarding answers.</Text>
        </Card>
      )}

      <Card title="Plan & billing">
        <Text style={[styles.muted, font('regular')]}>Plans and pricing are not decided yet.</Text>
      </Card>

      {sessionState.status === 'authenticated' ? (
        <NotificationsCard />
      ) : (
        <Card title="Notifications">
          <Text style={[styles.muted, font('regular')]}>Sign in to choose how Rein Drop alerts you.</Text>
        </Card>
      )}

      <Card title="Developer">
        <View style={styles.row}>
          <Text style={[styles.label, font('semibold')]}>API</Text>
          <Badge tone={apiBaseUrl.url ? 'neutral' : 'loss'}>{SOURCE_LABEL[apiBaseUrl.source]}</Badge>
        </View>
        <Text selectable style={[styles.body, font('medium')]}>
          {apiBaseUrl.url ?? '—'}
        </Text>
        <Text style={[styles.muted, font('regular')]}>{apiBaseUrl.detail}</Text>

        {check.state === 'checking' && <LoadingState label="Checking connection…" />}
        {check.state === 'ok' && (
          <View style={styles.row}>
            <Badge tone="profit">API live</Badge>
            <Badge tone={check.ready ? 'profit' : 'loss'}>
              {`${check.ready ? 'Ready' : 'Not ready'} · database ${check.database}`}
            </Badge>
          </View>
        )}
        {check.state === 'error' && (
          <SystemBanner
            tone="error"
            title="Cannot reach the API"
            message={`${check.message}. Is "pnpm --filter api dev" running, and is the phone on the same Wi-Fi?`}
          />
        )}

        <View style={styles.row}>
          <Button variant="secondary" loading={check.state === 'checking'} onPress={checkConnection}>
            Check connection
          </Button>
          <Button variant="text" onPress={() => router.push('/dev')}>
            UI primitives
          </Button>
        </View>
      </Card>
    </Screen>
  );
}

/** The five onboarding answers, editable (Screenbook frame 30). Reloads when Settings regains focus. */
function SellerSnapshotCard({ locale }: { locale: UserLocale | null }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; snapshot: SellerSnapshot }>({
    status: 'loading',
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.resolve()
        .then(() => getApiClient().getSellerSnapshot())
        .then(
          (snapshot) => !cancelled && setState({ status: 'ready', snapshot }),
          () => !cancelled && setState({ status: 'error' }),
        );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (state.status === 'loading') {
    return (
      <Card title="Seller Snapshot">
        <LoadingState label="Loading your answers…" />
      </Card>
    );
  }
  if (state.status === 'error') {
    return (
      <Card title="Seller Snapshot">
        <SystemBanner tone="error" title="Couldn't load your answers" message="Leave and reopen Settings to try again." />
      </Card>
    );
  }
  const { snapshot } = state;
  if (snapshot.status === 'not_started' || snapshot.status === 'not_reseller') {
    return (
      <Card title="Seller Snapshot">
        <Text style={[styles.muted, font('regular')]}>
          {snapshot.status === 'not_started'
            ? 'Five quick questions set Rein Drop up around how you source.'
            : "You told us you're not reselling right now - that experience is coming soon."}
        </Text>
        <Button
          variant="secondary"
          onPress={() => router.push(snapshot.status === 'not_started' ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
        >
          {snapshot.status === 'not_started' ? 'Set up now' : 'Change my answer'}
        </Button>
      </Card>
    );
  }

  const inProgress = snapshot.status === 'in_progress';
  return (
    <Card title="Seller Snapshot" action={inProgress ? <Badge tone="fresh">Not finished</Badge> : undefined}>
      {snapshotAnswerRows(snapshot, huntFormContext(locale)).map((row) => (
        <View key={row.question} style={styles.answer}>
          <Text style={[styles.muted, font('regular')]}>{row.question}</Text>
          <Text style={[styles.body, font('semibold')]}>{row.answer}</Text>
        </View>
      ))}
      <Text style={[styles.muted, font('regular')]}>
        These answers set the defaults for new Hunts. Changing them never changes existing Hunts.
      </Text>
      <Button
        variant="secondary"
        onPress={() => router.push(inProgress ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
      >
        {inProgress ? 'Finish setting up' : 'Edit answers'}
      </Button>
    </Card>
  );
}

/**
 * Notification choices per category and channel (Screenbook frame 28). Alerts, insights and
 * marketing are separate sections; marketing is opt-in. Each switch saves on its own.
 */
function NotificationsCard() {
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
      setStatus({ error: false, text: 'Saved' });
    } catch (err) {
      setPrefs(before);
      setStatus({ error: true, text: `Not saved: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(null);
    }
  };

  if (failed && !prefs) {
    return (
      <Card title="Notifications">
        <SystemBanner tone="error" title="Couldn't load your notification settings" message="Leave and reopen Settings to try again." />
      </Card>
    );
  }
  if (!prefs) {
    return (
      <Card title="Notifications">
        <LoadingState label="Loading notification settings…" />
      </Card>
    );
  }
  return (
    <Card title="Notifications">
      {preferenceSections(prefs).map((section) => (
        <View key={section.group} style={styles.prefSection}>
          <Text style={[styles.label, font('bold')]} accessibilityRole="header">
            {section.title}
          </Text>
          <Text style={[styles.muted, font('regular')]}>{section.description}</Text>
          {section.categories.map((c) => (
            <View key={c.category} style={styles.answer}>
              <Text style={[styles.body, font('semibold')]}>{c.title}</Text>
              <Text style={[styles.muted, font('regular')]}>{c.description}</Text>
              {c.channels.map((ch) => (
                <View key={ch.channel} style={styles.switchRow}>
                  <Text style={[styles.body, font('regular')]}>
                    {ch.label}
                    {!ch.editable ? ' (always on)' : ''}
                  </Text>
                  <Switch
                    value={ch.enabled}
                    disabled={!ch.editable || saving === `${c.category}:${ch.channel}`}
                    onValueChange={(v) => void toggle(c.category, ch.channel, v)}
                    accessibilityLabel={`${c.title}: ${ch.label}`}
                    trackColor={{ true: roles.text, false: roles.border }}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
      <Text style={[styles.muted, font('regular')]}>{NOTIFICATION_CHANNELS_NOTE}</Text>
      {status && (
        <Text style={[status.error ? styles.error : styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {status.text}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  prefSection: { gap: space[2], paddingTop: space[2] },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  error: { color: roles.text, fontSize: fontSize.sm, paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.loss.accent },
  answer: { gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  label: { color: roles.text, fontSize: fontSize.md },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
