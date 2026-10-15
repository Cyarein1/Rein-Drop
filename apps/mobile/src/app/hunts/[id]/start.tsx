import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { ApiError, type ActivationBlockReason, type EntitlementEvaluation, type Hunt } from '@rein-drop/api-client';
import { accountSiteLine, companionAccessSummary, companionActions, companionReasonText, huntReview } from '@rein-drop/client-core';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { PushCard } from '@/notifications/PushCard';
import { Badge, Button, Card, font, LoadingState, Screen, SystemBanner } from '@/ui';

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
      <Screen>
        <Stack.Screen options={{ title: t('hunts.liveTitle') }} />
        <Card title={live.name} action={<Badge tone="action">{t('hunts.liveBadge')}</Badge>}>
          <Text style={[styles.body, font('regular')]}>{huntReview(live, context).sentence}</Text>
        </Card>
        <Card title={t('hunts.nextTitle')}>
          <Text style={[styles.body, font('regular')]}>{t('hunts.nextBody')}</Text>
        </Card>
        {/* The moment push is worth asking for: a Hunt is now live (never on app launch). */}
        <PushCard variant="prompt" />
        <Button onPress={() => router.dismissTo('/hunts')} fullWidth>
          {t('hunts.goToHunts')}
        </Button>
      </Screen>
    );
  }

  const actions = companionActions(reasons);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('hunts.actionStart') }} />
      <Card>
        <Text style={[styles.body, font('regular')]}>{huntReview(hunt, context).sentence}</Text>
      </Card>
      <Text style={[styles.muted, font('regular')]}>{companionAccessSummary(entitlements, t)}</Text>

      {reasons.length > 0 ? (
        <>
          <SystemBanner
            tone="info"
            title={t('hunts.cantStartTitle')}
            message={[...reasons.map((r) => companionReasonText(r, t)), ...(accountLine ? [accountLine] : [])].join('\n')}
          />
          {actions.pauseAnother && (
            <Button onPress={() => router.push('/hunts')} fullWidth>
              {t('hunts.manageLive')}
            </Button>
          )}
          {actions.editHunt && (
            <Button variant={actions.pauseAnother ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/hunts/[id]/edit', params: { id: hunt.id } })} fullWidth>
              {t('hunts.editThis')}
            </Button>
          )}
        </>
      ) : (
        <Button onPress={start} loading={busy} fullWidth>
          {t('hunts.actionStart')}
        </Button>
      )}
      {error && <SystemBanner tone="error" title={t('hunts.startFailed')} message={error} />}
      <Button variant="text" onPress={() => router.dismissTo('/hunts')} disabled={busy}>
        {t('hunts.keepDraft')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
