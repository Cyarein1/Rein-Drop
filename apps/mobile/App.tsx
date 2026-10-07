import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createApiClient } from '@rein-drop/api-client';
import { colors } from '@rein-drop/design-tokens';

type ApiStatus =
  | { state: 'loading' }
  | { state: 'ok'; timestamp: string }
  | { state: 'error'; message: string };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export default function App() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Promise.resolve() so a synchronous config error (bad base URL) also lands in the catch.
    Promise.resolve()
      .then(() => createApiClient({ baseUrl: API_BASE_URL }).getHealth())
      .then(
        (health) => {
          if (!cancelled) setStatus({ state: 'ok', timestamp: health.timestamp });
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
    <View style={styles.container}>
      <Text style={styles.title}>Rein Drop</Text>
      <Text style={styles.subtitle}>Local development scaffold</Text>

      <View style={styles.card}>
        {status.state === 'loading' && (
          <View style={styles.row}>
            <ActivityIndicator color={colors.navy} />
            <Text style={styles.body}>Checking API…</Text>
          </View>
        )}
        {status.state === 'ok' && (
          <Text style={[styles.body, { color: colors.green }]}>API reachable ({status.timestamp})</Text>
        )}
        {status.state === 'error' && (
          <>
            <Text style={[styles.body, { color: colors.orange }]}>API unreachable: {status.message}</Text>
            <Text style={styles.hint}>Base URL: {API_BASE_URL || '(not set - see .env.example)'}</Text>
            <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </>
        )}
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 32, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 4, color: colors.navy },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.navy,
    alignSelf: 'stretch',
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { color: colors.navy },
  hint: { color: colors.navy, fontSize: 12 },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.orange,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: { color: colors.canvas, fontWeight: '600' },
});
