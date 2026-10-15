import { Fragment, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space } from '@rein-drop/design-tokens';
import { Wordmark } from '@/brand/Wordmark';
import { apiBaseUrl } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, colors, font, GUTTER, Icon, icons, type } from '@/ui';
import { sessionMessage, useSessionState } from './SessionProvider';

/**
 * Protects the app's tabs: children render only with an authenticated session.
 * Signed-out and error states always offer a next action (Sign in / Retry / Settings), in a calm
 * centred layout: wordmark, one headline, one line of help, full-width pill buttons.
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={t('auth.signingIn')} accessibilityState={{ busy: true }}>
          <Wordmark height={30} />
          <ActivityIndicator color={colors.text} />
          <Text style={[styles.help, font('regular')]}>{t('auth.signingIn')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const settings = (
    <Button variant="text" onPress={() => router.push('/settings')}>
      {t('auth.openSettings')}
    </Button>
  );

  if (state.status === 'unauthenticated') {
    const title = signIn ? t(state.sessionEnded ? 'auth.sessionEndedTitle' : 'auth.signInTitle') : t('auth.notSignedInTitle');
    return (
      <Shell
        title={title}
        message={sessionMessage(state, t)}
        help={signIn ? t('auth.signInHelp') : undefined}
        // Developer-only note: English.
        devNote={__DEV__ && !signIn ? 'Development sign-in is automatic. Make sure the API is running and the development user exists (pnpm db:seed).' : undefined}
      >
        {signIn ? (
          <Button size="large" onPress={() => void signIn()}>
            {t('auth.signIn')}
          </Button>
        ) : (
          <>
            <Button size="large" onPress={refresh}>
              {t('common.tryAgain')}
            </Button>
            {settings}
          </>
        )}
      </Shell>
    );
  }

  return (
    <Shell warning title={t('auth.cantReachTitle')} message={sessionMessage(state, t)} help={t('auth.cantReachHelp')} devNote={__DEV__ ? `API: ${apiBaseUrl.url ?? 'not configured'}` : undefined}>
      <Button size="large" onPress={refresh}>
        {t('common.tryAgain')}
      </Button>
      {settings}
    </Shell>
  );
}

function Shell({ title, message, help, devNote, warning, children }: { title: string; message?: string; help?: string; devNote?: string; warning?: boolean; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.top}>
          <Wordmark height={30} />
        </View>
        <View style={styles.middle}>
          {warning && (
            <View style={styles.warning} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon name={icons.warning} color={colors.warningText} size={28} />
            </View>
          )}
          <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
            {title}
          </Text>
          {message && (
            <Text style={[styles.message, font('regular')]} accessibilityRole={warning ? 'alert' : undefined}>
              {message}
            </Text>
          )}
          {help && <Text style={[styles.help, font('regular')]}>{help}</Text>}
          {devNote && <Text style={[styles.dev, font('regular')]}>{devNote}</Text>}
        </View>
        <View style={styles.actions}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  scroll: { flexGrow: 1, paddingHorizontal: GUTTER + space[2], paddingVertical: space[6], gap: space[6] },
  top: { alignItems: 'center', paddingTop: space[4] },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space[3] },
  warning: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.grouped, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: type.question, lineHeight: 32, textAlign: 'center', letterSpacing: -0.3 },
  message: { color: colors.text, fontSize: type.body, lineHeight: 21, textAlign: 'center' },
  help: { color: colors.textMuted, fontSize: type.callout, lineHeight: 20, textAlign: 'center' },
  dev: { color: colors.textMuted, fontSize: type.footnote, textAlign: 'center' },
  actions: { gap: space[2] },
});
