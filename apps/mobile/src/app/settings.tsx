import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { useSession } from '@/auth/session';
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

export default function SettingsScreen() {
  const session = useSession();
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

      <Card title="Account" action={session.isPlaceholder ? <Badge tone="info">Placeholder session</Badge> : undefined}>
        <Text style={[styles.body, font('medium')]}>{session.user.email}</Text>
        <Text style={[styles.muted, font('regular')]}>
          Sign-in is not implemented yet - everyone is signed in as this local development user.
        </Text>
        <Button variant="secondary" disabled>
          Sign out
        </Button>
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
