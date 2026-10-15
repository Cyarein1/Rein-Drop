import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { UserArea } from '@rein-drop/api-client';
import { accountSiteLine, companionAccessView, companionUsageLines } from '@rein-drop/client-core';
import { space, wash } from '@rein-drop/design-tokens';
import { LANGUAGE_NAMES } from '@rein-drop/i18n';
import { useAccess } from '@/access/AccessProvider';
import { useDisplayContext, useLanguage, useT } from '@/i18n/useT';
import { sessionMessage, useSessionState } from '@/auth/SessionProvider';
import { useCan } from '@/capabilities/CapabilitiesProvider';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { Badge, Button, colors, font, Icon, icons, LargeTitleHeader, ListRow, ListSection, LoadingState, RowIcon, Screen, SystemBanner, type, type IconName } from '@/ui';

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

/**
 * Account (decision 0018; mock-up Account): grouped rows like the phone's own Settings - you, your
 * access, then Settings rows that open their own screens (notifications, area, language, Seller
 * Snapshot), and Sign out. The Account tab (`largeTitle`) and the standalone /settings route (not
 * gated: signed-out people sign in here). Developer tools only in development builds.
 */
export default function AccountScreen({ largeTitle = false }: { largeTitle?: boolean }) {
  const t = useT();
  const body = <AccountBody />;
  if (!largeTitle) return body;
  return (
    <View style={styles.fill}>
      <LargeTitleHeader title={t('nav.tabAccount')} />
      {body}
    </View>
  );
}

function AccountBody() {
  const { state: sessionState, refresh, signIn, signOut } = useSessionState();
  const devTools = useCan('dev.tools');
  const t = useT();
  const signedIn = sessionState.status === 'authenticated';

  return (
    <Screen variant="grouped">
      {sessionState.status === 'loading' && <LoadingState label={t('account.checkingSession')} />}

      {sessionState.status === 'authenticated' && (
        <ListSection>
          <ListRow
            leading={<Avatar email={sessionState.session.user.email} />}
            title={sessionState.session.user.email}
            subtitle={sessionState.session.isDevelopment ? t('account.devSignedIn') : undefined}
            trailing={sessionState.session.isDevelopment ? <Badge tone="info">{t('account.devSignIn')}</Badge> : undefined}
            last
          />
        </ListSection>
      )}

      {(sessionState.status === 'unauthenticated' || sessionState.status === 'error') && (
        <View style={styles.signedOut}>
          <SystemBanner
            tone={sessionState.status === 'error' ? 'error' : 'warning'}
            title={sessionState.status === 'unauthenticated' && sessionState.sessionEnded ? t('account.sessionEnded') : sessionState.status === 'error' ? t('account.cantReach') : t('account.notSignedIn')}
            message={sessionMessage(sessionState, t)}
          />
          {sessionState.status === 'unauthenticated' && signIn ? (
            <Button size="large" onPress={() => void signIn()}>
              {t('account.signIn')}
            </Button>
          ) : (
            <Button variant="secondary" size="large" onPress={refresh}>
              {t('account.tryAgain')}
            </Button>
          )}
        </View>
      )}

      {signedIn && <AccessSection />}
      {signedIn && <SettingsSection />}

      {/* Developer tools: development builds only (capability dev.tools, decision 0018). */}
      {devTools && <DeveloperSection />}

      {signedIn && signOut && (
        <ListSection footer={t('account.switchAccount')}>
          <ListRow title={t('account.signOut')} destructive onPress={() => void signOut()} chevron={false} last />
        </ListSection>
      )}
    </Screen>
  );
}

/** First letter of the email on a navy circle. Decorative - the row names the account. */
function Avatar({ email }: { email: string }) {
  return (
    <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.avatarText, font('bold')]}>{(email.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/** Settings rows - each opens its own screen (iOS Settings pattern). */
function SettingsSection() {
  const t = useT();
  const router = useRouter();
  const language = useLanguage();
  const [area, setArea] = useState<UserArea | null>(null);
  // The area's name on the row; reloaded when Account comes back into focus (after editing it).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.resolve()
        .then(() => getApiClient().getMyArea())
        .then(
          (a) => !cancelled && setArea(a),
          () => undefined,
        );
      return () => {
        cancelled = true;
      };
    }, []),
  );
  const row = (icon: IconName, tint: string) => (
    <RowIcon tint={tint}>
      <Icon name={icon} size={17} color={colors.text} />
    </RowIcon>
  );
  return (
    <ListSection title={t('account.settingsTitle')}>
      <ListRow leading={row(icons.bell, wash.orange)} title={t('account.notificationsTitle')} onPress={() => router.push('/account/notifications')} />
      <ListRow leading={row(icons.location, wash.sky)} title={t('account.areaTitle')} value={area?.label} onPress={() => router.push('/account/area')} />
      <ListRow leading={row(icons.globe, wash.green)} title={t('account.languageTitle')} value={LANGUAGE_NAMES[language]} onPress={() => router.push('/account/language')} />
      <ListRow leading={row(icons.person, wash.yellow)} title={t('account.snapshotTitle')} onPress={() => router.push('/account/seller-profile')} last />
    </ListSection>
  );
}

/**
 * Your access - mobile companion (decision 0018): what the account can use now, from GET /me/access
 * (the same rules the API and worker enforce). No billing here: no prices, plan changes, cancel or
 * "manage billing on the web". The optional neutral account line shows only when the app is built
 * with EXPO_PUBLIC_ACCOUNT_SITE (off until the store review).
 */
function AccessSection() {
  const { load, reload } = useAccess();
  const { localeTag, t } = useDisplayContext();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  if (!access) {
    return (
      <ListSection title={t('account.accessTitle')}>
        <View style={styles.inset}>
          {load.status === 'error' ? (
            <SystemBanner
              tone="error"
              title={load.reason === 'offline' ? t('account.offline') : t('account.accessLoadFailed')}
              message={t('account.accessUnchanged')}
              action={
                <Button variant="secondary" size="small" onPress={reload}>
                  {t('account.tryAgain')}
                </Button>
              }
            />
          ) : (
            <LoadingState label={t('account.accessLoading')} />
          )}
        </View>
      </ListSection>
    );
  }
  const view = companionAccessView(access, localeTag, t);
  const accountLine = accountSiteLine(process.env.EXPO_PUBLIC_ACCOUNT_SITE, t);
  const usage = companionUsageLines(access, t);
  const [first, ...rest] = view.lines;
  return (
    <>
      {load.status === 'error' && <SystemBanner tone="info" title={t('account.accessStale')} message={t('account.accessStaleBody')} />}
      <ListSection title={t('account.accessTitle')} footer={accountLine ?? undefined}>
        <ListRow title={first ?? view.label} trailing={<Badge tone={view.tone}>{view.label}</Badge>} last={rest.length === 0 && usage.length === 0} />
        {rest.map((line, i) => (
          <ListRow key={line} title={line} last={i === rest.length - 1 && usage.length === 0} />
        ))}
        {usage.map((line, i) => (
          <UsageRow key={line} line={line} last={i === usage.length - 1} />
        ))}
      </ListSection>
    </>
  );
}

/** "Live Hunts: 1 of 1" as label / value when it has that shape (the whole line is announced). */
function UsageRow({ line, last }: { line: string; last: boolean }) {
  const cut = line.indexOf(': ');
  if (cut < 0) return <ListRow title={line} last={last} />;
  return <ListRow title={line.slice(0, cut)} value={line.slice(cut + 2)} accessibilityLabel={line} last={last} />;
}

/** DEVELOPMENT ONLY (English): the API this build talks to, a connection check, test push, UI primitives. */
function DeveloperSection() {
  const router = useRouter();
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const checkConnection = async () => {
    setCheck({ state: 'checking' });
    try {
      const client = getApiClient();
      await client.getHealth();
      const readiness = await client.getReadiness();
      setCheck({ state: 'ok', ready: readiness.status === 'ready', database: readiness.checks.database });
    } catch (err) {
      setCheck({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <ListSection title="Developer" footer={apiBaseUrl.detail}>
      <ListRow title="API" subtitle={apiBaseUrl.url ?? '—'} trailing={<Badge tone={apiBaseUrl.url ? 'neutral' : 'loss'}>{SOURCE_LABEL[apiBaseUrl.source]}</Badge>} />
      <ListRow
        title="Check connection"
        subtitle={check.state === 'checking' ? 'Checking connection…' : undefined}
        trailing={
          check.state === 'ok' ? (
            <View style={styles.devBadges}>
              <Badge tone="profit">API live</Badge>
              <Badge tone={check.ready ? 'profit' : 'loss'}>{`${check.ready ? 'Ready' : 'Not ready'} · database ${check.database}`}</Badge>
            </View>
          ) : undefined
        }
        onPress={() => void checkConnection()}
      />
      {check.state === 'error' && (
        <View style={styles.inset}>
          <SystemBanner tone="error" title="Cannot reach the API" message={`${check.message}. Is "pnpm --filter api dev" running, and is the phone on the same Wi-Fi?`} />
        </View>
      )}
      <TestPushRow />
      <ListRow title="UI primitives" onPress={() => router.push('/dev')} last />
    </ListSection>
  );
}

/**
 * DEVELOPMENT ONLY (inside the Developer section): asks the API for a test alert; the worker sends it
 * through the normal outbox (Expo on a development build, the simulator log otherwise). Tapping it
 * opens your latest deal - the whole register -> send -> tap -> deep link path.
 */
function TestPushRow() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sent = await getApiClient().sendTestNotification();
      setStatus(sent.dealId ? 'Queued - it arrives within a few seconds and opens your latest deal.' : 'Queued - it arrives within a few seconds and opens the inbox (no deals yet).');
    } catch (err) {
      setStatus(`Not sent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return <ListRow title={busy ? 'Sending a test notification…' : 'Send a test notification'} subtitle={status ?? undefined} onPress={() => void send()} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.grouped },
  signedOut: { gap: space[3] },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.background, fontSize: type.price },
  inset: { padding: 14, gap: space[2], backgroundColor: colors.background },
  devBadges: { alignItems: 'flex-end', gap: 4 },
});
