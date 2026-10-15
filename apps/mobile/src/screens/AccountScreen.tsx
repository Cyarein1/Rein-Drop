import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NotificationCategory, NotificationChannel, NotificationPreferences, SellerSnapshot } from '@rein-drop/api-client';
import { accountSiteLine, companionAccessView, companionUsageLines, notificationChannelsNote, preferenceSections, snapshotAnswerRows, withPreference } from '@rein-drop/client-core';
import { fontSize, roles, space, tones } from '@rein-drop/design-tokens';
import { countryFromLocaleTag } from '@rein-drop/api-client';
import { LANGUAGE_NAMES, LANGUAGES, translator, type Language } from '@rein-drop/i18n';
import { useAccess } from '@/access/AccessProvider';
import { deviceLanguageTag, useDisplayContext, useLanguage, useT } from '@/i18n/useT';
import { sessionMessage, useSessionState } from '@/auth/SessionProvider';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { useCan } from '@/capabilities/CapabilitiesProvider';
import { AreaSettings } from '@/geo/AreaSettings';
import { PushCard } from '@/notifications/PushCard';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { Badge, Button, Card, ChoiceGroup, font, LoadingState, Screen, SystemBanner } from '@/ui';

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
 * Account (decision 0018): access, notifications, area, Seller Snapshot, sign-out - the Account tab and
 * the standalone /settings route (not gated: signed-out people sign in here). Developer tools only in
 * development builds.
 */
export default function AccountScreen() {
  const { state: sessionState, refresh, signIn, signOut } = useSessionState();
  const devTools = useCan('dev.tools');
  const router = useRouter();
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const t = useT();

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
      <PlaceholderNotice>{t('account.placeholder')}</PlaceholderNotice>

      <Card
        title={t('account.accountTitle')}
        action={
          sessionState.status === 'authenticated' && sessionState.session.isDevelopment ? (
            <Badge tone="info">{t('account.devSignIn')}</Badge>
          ) : undefined
        }
      >
        {sessionState.status === 'loading' && <LoadingState label={t('account.checkingSession')} />}
        {sessionState.status === 'authenticated' && (
          <>
            <Text style={[styles.body, font('medium')]}>{sessionState.session.user.email}</Text>
            {sessionState.session.isDevelopment && (
              <Text style={[styles.muted, font('regular')]}>
                {t('account.devSignedIn')}
              </Text>
            )}
            {signOut && (
              <>
                <Text style={[styles.muted, font('regular')]}>{t('account.switchAccount')}</Text>
                <Button variant="secondary" onPress={() => void signOut()}>
                  {t('account.signOut')}
                </Button>
              </>
            )}
          </>
        )}
        {(sessionState.status === 'unauthenticated' || sessionState.status === 'error') && (
          <>
            <SystemBanner
              tone={sessionState.status === 'error' ? 'error' : 'warning'}
              title={sessionState.status === 'unauthenticated' && sessionState.sessionEnded ? t('account.sessionEnded') : sessionState.status === 'error' ? t('account.cantReach') : t('account.notSignedIn')}
              message={sessionMessage(sessionState, t)}
            />
            {sessionState.status === 'unauthenticated' && signIn ? (
              <Button onPress={() => void signIn()}>{t('account.signIn')}</Button>
            ) : (
              <Button variant="secondary" onPress={refresh}>
                {t('account.tryAgain')}
              </Button>
            )}
          </>
        )}
      </Card>

      {sessionState.status === 'authenticated' && <LanguageCard />}

      {sessionState.status === 'authenticated' && (
        <Card title={t('account.areaTitle')}>
          <AreaSettings />
        </Card>
      )}

      {sessionState.status === 'authenticated' ? (
        <SellerSnapshotCard />
      ) : (
        <Card title={t('account.snapshotTitle')}>
          <Text style={[styles.muted, font('regular')]}>{t('account.snapshotSignIn')}</Text>
        </Card>
      )}

      {sessionState.status === 'authenticated' ? (
        <AccessCard />
      ) : (
        <Card title={t('account.accessTitle')}>
          <Text style={[styles.muted, font('regular')]}>{t('account.accessSignIn')}</Text>
        </Card>
      )}

      {sessionState.status === 'authenticated' && (
        <Card title={t('account.pushTitle')}>
          <PushCard variant="settings" />
        </Card>
      )}

      {sessionState.status === 'authenticated' ? (
        <NotificationsCard />
      ) : (
        <Card title={t('account.notificationsTitle')}>
          <Text style={[styles.muted, font('regular')]}>{t('account.notificationsSignIn')}</Text>
        </Card>
      )}

      {/* Developer tools: development builds only (capability dev.tools, decision 0018). */}
      {devTools && (
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
          <TestPushButton />
        </Card>
      )}
    </Screen>
  );
}

/** The five onboarding answers, editable (Screenbook frame 30). Reloads when Settings regains focus. */
function SellerSnapshotCard() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
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
      <Card title={t('account.snapshotTitle')}>
        <LoadingState label={t('onboarding.loadingAnswers')} />
      </Card>
    );
  }
  if (state.status === 'error') {
    return (
      <Card title={t('account.snapshotTitle')}>
        <SystemBanner tone="error" title={t('onboarding.loadFailed')} message={t('account.reopenToRetry')} />
      </Card>
    );
  }
  const { snapshot } = state;
  if (snapshot.status === 'not_started' || snapshot.status === 'not_reseller') {
    return (
      <Card title={t('account.snapshotTitle')}>
        <Text style={[styles.muted, font('regular')]}>
          {snapshot.status === 'not_started'
            ? t('account.snapshotNotStarted')
            : t('account.snapshotNotReseller')}
        </Text>
        <Button
          variant="secondary"
          onPress={() => router.push(snapshot.status === 'not_started' ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
        >
          {snapshot.status === 'not_started' ? t('account.setUpNow') : t('onboarding.changeAnswer')}
        </Button>
      </Card>
    );
  }

  const inProgress = snapshot.status === 'in_progress';
  return (
    <Card title={t('account.snapshotTitle')} action={inProgress ? <Badge tone="fresh">{t('account.notFinished')}</Badge> : undefined}>
      {snapshotAnswerRows(snapshot, context).map((row) => (
        <View key={row.question} style={styles.answer}>
          <Text style={[styles.muted, font('regular')]}>{row.question}</Text>
          <Text style={[styles.body, font('semibold')]}>{row.answer}</Text>
        </View>
      ))}
      <Text style={[styles.muted, font('regular')]}>
        {t('account.snapshotNote')}
      </Text>
      <Button
        variant="secondary"
        onPress={() => router.push(inProgress ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
      >
        {inProgress ? t('account.finishSetup') : t('account.editAnswers')}
      </Button>
    </Card>
  );
}

/**
 * Notification choices per category and channel (Screenbook frame 28). Alerts, insights and
 * marketing are separate sections; marketing is opt-in. Each switch saves on its own.
 */
function NotificationsCard() {
  const t = useT();
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
      setStatus({ error: false, text: t('account.prefsSaved') });
    } catch (err) {
      setPrefs(before);
      setStatus({ error: true, text: t('account.prefsFailed', { message: err instanceof Error ? err.message : String(err) }) });
    } finally {
      setSaving(null);
    }
  };

  if (failed && !prefs) {
    return (
      <Card title={t('account.notificationsTitle')}>
        <SystemBanner tone="error" title={t('account.prefsLoadFailed')} message={t('account.reopenToRetry')} />
      </Card>
    );
  }
  if (!prefs) {
    return (
      <Card title={t('account.notificationsTitle')}>
        <LoadingState label={t('account.prefsLoading')} />
      </Card>
    );
  }
  return (
    <Card title={t('account.notificationsTitle')}>
      {preferenceSections(prefs, t).map((section) => (
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
                    {ch.editable ? ch.label : t('account.alwaysOn', { label: ch.label })}
                  </Text>
                  <Switch
                    value={ch.enabled}
                    disabled={!ch.editable || saving === `${c.category}:${ch.channel}`}
                    onValueChange={(v) => void toggle(c.category, ch.channel, v)}
                    accessibilityLabel={t('account.labelValue', { label: c.title, value: ch.label })}
                    trackColor={{ true: roles.text, false: roles.border }}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
      <Text style={[styles.muted, font('regular')]}>{notificationChannelsNote(t)}</Text>
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

/**
 * Your access - mobile companion (decision 0018): what the account can use now, from GET /me/access
 * (the same rules the API and worker enforce). No billing here: no prices, plan changes, cancel or
 * "manage billing on the web". The optional neutral account line shows only when the app is built
 * with EXPO_PUBLIC_ACCOUNT_SITE (off until the store review).
 */
function AccessCard() {
  const { load, reload } = useAccess();
  const { localeTag, t } = useDisplayContext();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  if (!access) {
    if (load.status === 'error') {
      return (
        <Card title={t('account.accessTitle')}>
          <SystemBanner
            tone="error"
            title={load.reason === 'offline' ? t('account.offline') : t('account.accessLoadFailed')}
            message={t('account.accessUnchanged')}
            action={
              <Button variant="secondary" onPress={reload}>
                {t('account.tryAgain')}
              </Button>
            }
          />
        </Card>
      );
    }
    return (
      <Card title={t('account.accessTitle')}>
        <LoadingState label={t('account.accessLoading')} />
      </Card>
    );
  }
  const view = companionAccessView(access, localeTag, t);
  const accountLine = accountSiteLine(process.env.EXPO_PUBLIC_ACCOUNT_SITE, t);
  return (
    <Card title={t('account.accessTitle')} action={<Badge tone={view.tone}>{view.label}</Badge>}>
      {load.status === 'error' && (
        <SystemBanner tone="info" title={t('account.accessStale')} message={t('account.accessStaleBody')} />
      )}
      {view.lines.map((line) => (
        <Text key={line} style={[styles.body, font('regular')]}>
          {line}
        </Text>
      ))}
      {companionUsageLines(access, t).map((line) => (
        <Text key={line} style={[styles.muted, font('regular')]}>
          {line}
        </Text>
      ))}
      {accountLine && <Text style={[styles.muted, font('regular')]}>{accountLine}</Text>}
    </Card>
  );
}

/**
 * DEVELOPMENT ONLY (inside the Developer card): asks the API for a test alert; the worker sends it
 * through the normal outbox (Expo on a development build, the simulator log otherwise). Tapping it
 * opens your latest deal - the whole register -> send -> tap -> deep link path.
 */
function TestPushButton() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
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
  return (
    <View style={styles.answer}>
      <Button variant="secondary" loading={busy} onPress={() => void send()}>
        Send a test notification
      </Button>
      {status && <Text style={[styles.muted, font('regular')]}>{status}</Text>}
    </View>
  );
}

/**
 * Language (docs/i18n/README.md): English or German. Until one is chosen the phone's language is
 * used. Saved to the account (PUT /me/locale), so web and push follow the same choice.
 */
function LanguageCard() {
  const t = useT();
  const language = useLanguage();
  const { state, setLocale } = useSessionState();
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locale = state.status === 'authenticated' ? state.session.user.locale : null;
  const choose = async (next: Language) => {
    if (next === language) return;
    setSaving(true);
    setStatus(null);
    try {
      const country = locale?.countryCode ?? countryFromLocaleTag(deviceLanguageTag()) ?? 'US';
      const saved = await getApiClient().updateLocale({ countryCode: country, currency: locale?.currency, distanceUnit: locale?.distanceUnit, language: next });
      setLocale(saved);
      setStatus(translator(next)('account.languageSaved'));
    } catch (err) {
      setStatus(t('account.languageFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card title={t('account.languageTitle')}>
      <ChoiceGroup<Language>
        legend={t('account.languageTitle')}
        hideLegend
        options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
        value={language}
        onChange={(next) => void choose(next)}
      />
      <Text style={[styles.muted, font('regular')]}>{t('account.languageHint')}</Text>
      {saving && <LoadingState label="…" />}
      {status && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </Card>
  );
}
