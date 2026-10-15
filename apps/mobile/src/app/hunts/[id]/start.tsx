import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { ApiError, type ActivationBlockReason, type EntitlementEvaluation, type Hunt } from '@rein-drop/api-client';
import { accountSiteLine, companionAccessSummary, companionActions, companionReasonText, huntReview } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { PushCard } from '@/notifications/PushCard';
import { ActionBar, Badge, Button, colors, font, ListRow, ListSection, LoadingState, Screen, SystemBanner, type } from '@/ui';

interface Loaded {
  hunt: Hunt;
  entitlements: EntitlementEvaluation;
  reasons: ActivationBlockReason[];
}

/**
 * Start watching - mobile companion (decision 0018). The Hunt goes live within the person's CURRENT
 * access (the server decides; no subscription = Free). The app never sells: no plan picker, prices,
 * "upgrade" or "subscribe on the web" - a limit is explained neutrally with what can be done inside
 * it (pause another Hunt, edit this one). Plans and billing live on the web app only.
 */
export default function StartWatchingScreen() {
  return (
    <SessionGate>
      <StartWatchingLoader />
    </SessionGate>
  );
}

function StartWatchingLoader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Loaded }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        const api = getApiClient();
        return Promise.all([api.getHunt(id), api.getEntitlements(), api.checkHuntActivation(id)]);
      })
      .then(
        ([hunt, entitlements, check]) => !cancelled && setState({ status: 'ready', data: { hunt, entitlements, reasons: check.reasons } }),
        (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label={t('hunts.checkingAccess')} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone="error"
          title={t('hunts.checkFailed')}
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              {t('hunts.tryAgain')}
            </Button>
          }
        />
      </Screen>
    );
  }
  return <StartWatching {...state.data} />;
}

function StartWatching({ hunt, entitlements, reasons: initialReasons }: Loaded) {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [live, setLive] = useState<Hunt | null>(hunt.status === 'LIVE' ? hunt : null);
  const [reasons, setReasons] = useState(initialReasons);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accountLine = accountSiteLine(process.env.EXPO_PUBLIC_ACCOUNT_SITE, t);

  // The success state only changes the header: say it out loud.
  useEffect(() => {
    if (live) AccessibilityInfo.announceForAccessibility(t('hunts.liveAnnounce', { name: live.name }));
  }, [live, t]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setLive(await getApiClient().transitionHunt(hunt.id, 'activate'));
    } catch (err) {
      // The server is the authority: its block replaces the preview.
      if (err instanceof ApiError && err.activationBlock) setReasons(err.activationBlock.reasons);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (live) {
    return (
      <Screen
        variant="grouped"
        footer={
          <ActionBar>
            <Button size="large" onPress={() => router.dismissTo('/hunts')} fullWidth>
              {t('hunts.goToHunts')}
            </Button>
          </ActionBar>
        }
      >
        <Stack.Screen options={{ title: t('hunts.liveTitle') }} />
        <View style={styles.hero}>
          <Badge tone="action">{t('hunts.liveBadge')}</Badge>
          <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
            {live.name}
          </Text>
          <Text style={[styles.body, font('regular')]}>{huntReview(live, context).sentence}</Text>
        </View>
        <ListSection title={t('hunts.nextTitle')}>
          <ListRow title={t('hunts.nextBody')} last />
        </ListSection>
        {/* The moment push is worth asking for: a Hunt is now live (never on app launch). */}
        <PushCard variant="prompt" />
      </Screen>
    );
  }

  const actions = companionActions(reasons);
  const blocked = reasons.length > 0;
  return (
    <Screen
      variant="grouped"
      footer={
        <ActionBar stacked>
          {blocked ? (
            <>
              {actions.pauseAnother && (
                <Button size="large" onPress={() => router.push('/hunts')} fullWidth>
                  {t('hunts.manageLive')}
                </Button>
              )}
              {actions.editHunt && (
                <Button
                  size="large"
                  variant={actions.pauseAnother ? 'secondary' : 'primary'}
                  onPress={() => router.push({ pathname: '/hunts/[id]/edit', params: { id: hunt.id } })}
                  fullWidth
                >
                  {t('hunts.editThis')}
                </Button>
              )}
            </>
          ) : (
            <Button size="large" onPress={start} loading={busy} fullWidth>
              {t('hunts.actionStart')}
            </Button>
          )}
          <Button variant="text" onPress={() => router.dismissTo('/hunts')} disabled={busy}>
            {t('hunts.keepDraft')}
          </Button>
        </ActionBar>
      }
    >
      <Stack.Screen options={{ title: t('hunts.actionStart') }} />
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
          {hunt.name}
        </Text>
        <Text style={[styles.body, font('regular')]}>{huntReview(hunt, context).sentence}</Text>
        <Text style={[styles.muted, font('regular')]}>{companionAccessSummary(entitlements, t)}</Text>
      </View>
      {blocked && (
        <SystemBanner
          tone="info"
          title={t('hunts.cantStartTitle')}
          message={[...reasons.map((r) => companionReasonText(r, t)), ...(accountLine ? [accountLine] : [])].join('\n')}
        />
      )}
      {error && <SystemBanner tone="error" title={t('hunts.startFailed')} message={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  hero: { gap: space[2], padding: 14, borderRadius: radius.md, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: type.title },
  body: { color: colors.text, fontSize: type.body, lineHeight: 21 },
  muted: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
});
