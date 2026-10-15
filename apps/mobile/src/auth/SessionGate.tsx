import { Fragment, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { apiBaseUrl } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, font, LoadingState, Screen, SystemBanner } from '@/ui';
import { sessionMessage, useSessionState } from './SessionProvider';

/**
 * Protects the app's tabs: children render only with an authenticated session.
 * Signed-out and error states always offer a next action (Sign in / Retry / Settings).
 * The companion signs in to an EXISTING Rein Drop account (decision 0018) - accounts are created
 * on the web; see docs/strategy/MOBILE_ACCOUNT_ACCESS.md for the store-review assumptions.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { state, refresh, signIn } = useSessionState();
  const router = useRouter();
  const t = useT();

  // Keyed by account: switching accounts remounts every screen, so nothing of the previous
  // account (lists, drafts, cached answers) can show.
  if (state.status === 'authenticated') return <Fragment key={state.session.user.userId}>{children}</Fragment>;
  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label={t('auth.signingIn')} />
      </View>
    );
  }

  const actions = (
    <View style={styles.actions}>
      <Button onPress={refresh}>{t('common.tryAgain')}</Button>
      <Button variant="secondary" onPress={() => router.push('/settings')}>
        {t('auth.openSettings')}
      </Button>
    </View>
  );

  if (state.status === 'unauthenticated') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Screen>
          {signIn ? (
            <>
              <SystemBanner
                tone={state.sessionEnded ? 'warning' : 'info'}
                title={t(state.sessionEnded ? 'auth.sessionEndedTitle' : 'auth.signInTitle')}
                message={sessionMessage(state, t)}
              />
              <Text style={[styles.help, font('regular')]}>
                {t('auth.signInHelp')}
              </Text>
              <View style={styles.actions}>
                <Button onPress={() => void signIn()}>{t('auth.signIn')}</Button>
              </View>
            </>
          ) : (
            <SystemBanner tone="warning" title={t('auth.notSignedInTitle')} message={sessionMessage(state, t)} />
          )}
          {/* Developer-only note: English. */}
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
        <SystemBanner tone="error" title={t('auth.cantReachTitle')} message={sessionMessage(state, t)} />
        <Text style={[styles.help, font('regular')]}>{t('auth.cantReachHelp')}</Text>
        {__DEV__ && <Text style={[styles.help, font('regular')]}>API: {apiBaseUrl.url ?? 'not configured'}</Text>}
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
