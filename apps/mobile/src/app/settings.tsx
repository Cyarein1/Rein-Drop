import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
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
      <PlaceholderNotice>Settings sections are listed but not editable yet.</PlaceholderNotice>

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

      <Card title="Seller Snapshot">
        <Text style={[styles.muted, font('regular')]}>Your five onboarding answers will appear here.</Text>
      </Card>

      <Card title="Plan & billing">
        <Text style={[styles.muted, font('regular')]}>Plans and pricing are not decided yet.</Text>
      </Card>

      <Card title="Notifications">
        <Text style={[styles.muted, font('regular')]}>
          Deal alerts, operational alerts and the weekly insight will be configured here.
        </Text>
      </Card>

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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  label: { color: roles.text, fontSize: fontSize.md },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
