import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { apiBaseUrl } from '@/config/api';
import { Button, font, LoadingState, Screen, SystemBanner } from '@/ui';
import { useSessionState } from './SessionProvider';

/**
 * Protects the app's tabs: children render only with an authenticated session.
 * Signed-out and error states always offer a next action (Retry / Settings).
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { state, refresh, signIn } = useSessionState();
  const router = useRouter();

  if (state.status === 'authenticated') return <>{children}</>;
  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label="Signing you in…" />
      </View>
    );
  }

  const actions = (
    <View style={styles.actions}>
      <Button onPress={refresh}>Try again</Button>
      <Button variant="secondary" onPress={() => router.push('/settings')}>
        Open Settings
      </Button>
    </View>
  );

  if (state.status === 'unauthenticated') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Screen>
          {signIn ? (
            <>
              <SystemBanner tone="info" title="Sign in to Rein Drop" message={state.reason} />
              <Text style={[styles.help, font('regular')]}>
                {"You'll continue on a secure Microsoft page to sign in with your email and password - or to create your account if you're new."}
              </Text>
              <View style={styles.actions}>
                <Button onPress={() => void signIn()}>Sign in with email</Button>
                <Button variant="secondary" onPress={() => void signIn()}>
                  Create an account
                </Button>
              </View>
            </>
          ) : (
            <SystemBanner tone="warning" title="You're not signed in" message={state.reason} />
          )}
          {__DEV__ && !signIn && (
            <Text style={[styles.help, font('regular')]}>
              Development sign-in is automatic. Make sure the API is running and the development user exists
              (pnpm db:seed).
            </Text>
          )}
          {!signIn && actions}
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Screen>
        <SystemBanner tone="error" title="Can't reach Rein Drop" message={state.message} />
        <Text style={[styles.help, font('regular')]}>API: {apiBaseUrl.url ?? 'not configured'}</Text>
        {actions}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: roles.background },
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  help: { color: roles.textMuted, fontSize: fontSize.sm },
});
