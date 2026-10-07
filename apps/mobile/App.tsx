import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createApiClient, type ReadinessResponse } from '@rein-drop/api-client';
import { roles } from '@rein-drop/design-tokens';
import { Wordmark } from './src/brand/Wordmark';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  font,
  interFonts,
  LoadingState,
  Metric,
  Screen,
  setInterLoaded,
  SystemBanner,
  TextInput,
} from './src/ui';

type ApiStatus =
  | { state: 'loading' }
  | { state: 'ok'; timestamp: string; readiness: ReadinessResponse | null }
  | { state: 'error'; message: string };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(interFonts);
  // Continue with the system font if Inter fails to load - never block the app on fonts.
  const fontsReady = fontsLoaded || !!fontError;
  setInterLoaded(fontsLoaded);

  return (
    <SafeAreaProvider>
      {fontsReady ? (
        <Home />
      ) : (
        <View style={styles.boot}>
          <LoadingState label="Starting Rein Drop…" />
        </View>
      )}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

/** Development home: API status + a compact gallery of the UI primitives. */
function Home() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Promise.resolve() so a synchronous config error (bad base URL) also lands in the catch.
    Promise.resolve()
      .then(async () => {
        const client = createApiClient({ baseUrl: API_BASE_URL });
        const health = await client.getHealth();
        const readiness = await client.getReadiness().catch(() => null);
        return { timestamp: health.timestamp, readiness };
      })
      .then(
        (result) => {
          if (!cancelled) setStatus({ state: 'ok', ...result });
        },
        (err: unknown) => {
          if (!cancelled) {
            setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus({ state: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <Screen>
      <Wordmark height={44} />
      <Text style={[styles.muted, font('regular')]}>Local development scaffold</Text>

      <Card title="System status">
        {status.state === 'loading' && <LoadingState label="Checking API…" />}
        {status.state === 'ok' && (
          <View style={styles.row}>
            <Badge tone="profit">API live</Badge>
            {status.readiness ? (
              <Badge tone={status.readiness.status === 'ready' ? 'profit' : 'loss'}>
                {`${status.readiness.status === 'ready' ? 'Ready' : 'Not ready'} · database ${status.readiness.checks.database}`}
              </Badge>
            ) : (
              <Badge tone="neutral">Readiness unknown</Badge>
            )}
          </View>
        )}
        {status.state === 'error' && (
          <SystemBanner
            tone="error"
            title="API unreachable"
            message={`${status.message}. Base URL: ${API_BASE_URL || '(not set - see .env.example)'}`}
            action={
              <Button variant="secondary" onPress={retry}>
                Retry
              </Button>
            }
          />
        )}
      </Card>

      <Card title="UI primitives">
        <View style={styles.row}>
          <Button>Start watching</Button>
          <Button variant="secondary">Save</Button>
        </View>
        <View style={styles.row}>
          <Button variant="text">Edit</Button>
          <Button variant="destructive">Archive</Button>
          <Button loading>Saving</Button>
        </View>
        <TextInput label="Email" kind="email" placeholder="you@example.com" />
        <TextInput label="Password" kind="password" />
        <TextInput label="Max buy price" kind="money" currency="USD" placeholder="0.00" error="Enter a price above 0" />
        <View style={styles.row}>
          <Badge tone="fresh">Just dropped · 2 min ago</Badge>
          <Badge tone="neutral">eBay</Badge>
          <Badge tone="loss">Unavailable</Badge>
        </View>
        <View style={styles.row}>
          <Metric label="Realized profit" value="+$386" tone="profit" />
          <Metric label="Upside" value="$150" estimated />
        </View>
        <SystemBanner tone="warning" title="Facebook Marketplace checks are delayed" message="eBay monitoring continues." />
      </Card>

      <EmptyState
        mascot="welcome"
        title="No Hunts yet"
        description="Tell Rein Drop what to watch for and it will check the marketplaces for you."
        action={<Button>Create your first Hunt</Button>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
  muted: { color: roles.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
});
