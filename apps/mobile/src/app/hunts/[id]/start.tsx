import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  type ActivationBlock,
  type ActivationCheck,
  type BillingInfo,
  type EntitlementEvaluation,
  type Hunt,
  type Plan,
} from '@rein-drop/api-client';
import {
  huntFormContext,
  huntReview,
  planGateOptions,
  RESOLUTION_LABEL,
  type PlanGateOption,
} from '@rein-drop/client-core';
import { colors, fontSize, radius, roles, space, wash } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, font, LoadingState, Screen, SystemBanner } from '@/ui';
import { PushCard } from '@/notifications/PushCard';

interface Loaded {
  hunt: Hunt;
  plans: Plan[];
  entitlements: EntitlementEvaluation;
  check: ActivationCheck;
  billing: BillingInfo;
}

type GateView = { kind: 'quick' } | { kind: 'gate' } | { kind: 'confirm'; option: PlanGateOption } | { kind: 'live'; hunt: Hunt };

/**
 * Start watching: plan gate (App Flow Blueprint sections 6-7). Free works here; paid plans are bought
 * on the web (Stripe) - native store billing is not built (decision 0014). Development builds keep
 * the fake confirmation.
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
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Loaded }>(
    { status: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Everything comes from the server - no plan names, limits or prices are assumed here.
    Promise.resolve()
      .then(() => {
        const api = getApiClient();
        return Promise.all([api.getHunt(id), api.listPlans(), api.getEntitlements(), api.checkHuntActivation(id), api.getBillingInfo()]);
      })
      .then(
        ([hunt, plans, entitlements, check, billing]) =>
          !cancelled && setState({ status: 'ready', data: { hunt, plans, entitlements, check, billing } }),
        (err: unknown) =>
          !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label="Loading plans…" />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone="error"
          title="Couldn't load plans"
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }
  return <PlanGate {...state.data} />;
}

function PlanGate({ hunt, plans, entitlements, check, billing }: Loaded) {
  const router = useRouter();
  const session = useSession();
  const context = huntFormContext(session.user.locale);
  const hasPlan = entitlements.subscription !== null;
  const [view, setView] = useState<GateView>(
    hunt.status === 'LIVE' ? { kind: 'live', hunt } : hasPlan && check.canActivate ? { kind: 'quick' } : { kind: 'gate' },
  );
  const [block, setBlock] = useState<ActivationBlock | null>(
    hasPlan && !check.canActivate && check.reasons.length ? { planCode: check.planCode, reasons: check.reasons } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The success screen only changes the header: say it out loud.
  useEffect(() => {
    if (view.kind === 'live') AccessibilityInfo.announceForAccessibility(`Your Hunt ${view.hunt.name} is live`);
  }, [view]);

  const options = planGateOptions(plans, hunt, entitlements.usage.activeHunts, entitlements.subscription?.planCode ?? null, context.localeTag);

  /** Free: no card. Development builds: the fake confirmation. Paid plans in Stripe mode never get here. */
  const start = async (choice?: { planCode: string; free: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      if (choice?.free) await api.chooseFreePlan();
      else if (choice) await api.confirmDevBilling(choice.planCode);
      setView({ kind: 'live', hunt: await api.transitionHunt(hunt.id, 'activate') });
    } catch (err) {
      if (err instanceof ApiError && err.activationBlock) {
        setBlock(err.activationBlock);
        setView({ kind: 'gate' });
      }
      setError(
        err instanceof ApiError && err.status === 404 && choice
          ? "Billing isn't available yet."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  if (view.kind === 'live') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Hunt is live' }} />
        <Card title={view.hunt.name} action={<Badge tone="action">Live</Badge>}>
          <Text style={[styles.body, font('regular')]}>{huntReview(view.hunt, context).sentence}</Text>
        </Card>
        <Card title="What happens next">
          <Text style={[styles.body, font('regular')]}>
            You can leave Rein Drop. We&apos;ll alert you when something worth reviewing appears.
          </Text>
        </Card>
        {/* The moment push is worth asking for: a Hunt is now live (never on app launch). */}
        <PushCard variant="prompt" />
        <Button onPress={() => router.dismissTo('/hunts')} fullWidth>
          Go to Hunts
        </Button>
      </Screen>
    );
  }

  if (view.kind === 'quick') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Start watching' }} />
        <Card>
          <Text style={[styles.body, font('regular')]}>{huntReview(hunt, context).sentence}</Text>
        </Card>
        <Text style={[styles.body, font('regular')]}>
          You&apos;re on the {entitlements.plan.name} plan.
          {entitlements.remaining.activeHunts !== null &&
            ` ${entitlements.remaining.activeHunts} live ${entitlements.remaining.activeHunts === 1 ? 'Hunt' : 'Hunts'} left.`}
        </Text>
        {error && <SystemBanner tone="error" title="Couldn't start" message={error} />}
        <Button onPress={() => start()} loading={busy} fullWidth>
          Start watching
        </Button>
        <Button variant="secondary" onPress={() => setView({ kind: 'gate' })} disabled={busy} fullWidth>
          Change plan
        </Button>
      </Screen>
    );
  }

  if (view.kind === 'confirm') {
    const { option } = view;
    const free = option.plan.pricing.status === 'free';
    // No in-app purchases: paid plans are bought on the web (native store billing isn't built).
    const webOnly = !free && billing.mode === 'stripe';
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Confirm plan' }} />
        {free ? (
          <SystemBanner tone="info" title="Free - no card, no charge" message="You can upgrade later if you need more live Hunts or marketplaces." />
        ) : webOnly ? (
          <SystemBanner
            tone="info"
            title="Paid plans are bought on the web"
            message={`${option.plan.name} isn't sold in the app. Sign in to Rein Drop on the web to subscribe; your plan then applies here too.`}
          />
        ) : (
          <SystemBanner
            tone="warning"
            title="Development billing - no card, no charge"
            message="This stands in for real checkout in development. Confirming records your plan choice only."
          />
        )}
        <Card title={option.plan.name} action={<Badge tone="neutral">{option.priceLabel}</Badge>}>
          {option.lines.map((l) => (
            <Text key={l} style={[styles.line, font('regular')]}>
              • {l}
            </Text>
          ))}
        </Card>
        {error && <SystemBanner tone="error" title="Couldn't start" message={error} />}
        {!webOnly && (
          <Button onPress={() => start({ planCode: option.plan.code, free })} loading={busy} fullWidth>
            {free ? 'Choose Free and start' : 'Confirm (development) and start'}
          </Button>
        )}
        <Button variant="secondary" onPress={() => setView({ kind: 'gate' })} disabled={busy} fullWidth>
          Back to plans
        </Button>
      </Screen>
    );
  }

  return (
    <Screen description={`Choose a plan to start watching “${hunt.name}”.`}>
      <Stack.Screen options={{ title: 'Choose a plan' }} />
      {billing.mode === 'development' && (
        <SystemBanner
          tone="info"
          title="Development data"
          message="Plans, limits and prices are placeholders while pricing is decided. No payment is taken."
        />
      )}
      {block && (
        <SystemBanner
          tone="warning"
          title="This Hunt can't start yet - it's saved as a draft"
          message={block.reasons
            .map((r) => {
              const text = r.code === 'NOT_READY' ? r.problems.join(' ') : r.message;
              return r.resolutions.includes('pause_another_hunt') ? `${text} (${RESOLUTION_LABEL.pause_another_hunt} in Hunts.)` : text;
            })
            .join('\n')}
        />
      )}
      {error && !block && <SystemBanner tone="error" title="Couldn't start" message={error} />}
      {options.map((option) => (
        <View key={option.plan.code} style={[styles.planCard, option.recommended && styles.recommended]}>
          <View style={styles.planHeader}>
            <Text style={[styles.planName, font('bold')]}>{option.plan.name}</Text>
            <View style={styles.badges}>
              {option.recommended && <Badge tone="action">Recommended</Badge>}
              {option.isCurrent && <Badge tone="info">Current</Badge>}
            </View>
          </View>
          <Text style={[styles.price, font('extrabold')]}>{option.priceLabel}</Text>
          {option.plan.pricing.status === 'tbd' && (
            <Text style={[styles.muted, font('regular')]}>Pricing not decided yet</Text>
          )}
          {!option.plan.limitsFinal && <Badge tone="fresh">Placeholder limits</Badge>}
          {option.lines.map((l) => (
            <Text key={l} style={[styles.line, font('regular')]}>
              • {l}
            </Text>
          ))}
          {option.reasons.length > 0 && (
            <View style={styles.cannot}>
              <Text style={[styles.body, font('semibold')]}>Can&apos;t run this Hunt:</Text>
              {option.reasons.map((r) => (
                <Text key={r.code} style={[styles.line, font('regular')]}>
                  {r.code === 'NOT_READY' ? r.problems.join(' ') : r.message}
                </Text>
              ))}
            </View>
          )}
          <Button
            variant={option.recommended ? 'primary' : 'secondary'}
            onPress={() => setView({ kind: 'confirm', option })}
            disabled={!option.canRunHunt || !option.available}
            fullWidth
          >
            {`Choose ${option.plan.name}`}
          </Button>
        </View>
      ))}
      <Button variant="text" onPress={() => router.dismissTo('/hunts')}>
        Not now - keep it as a draft
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
  body: { color: roles.text, fontSize: fontSize.md },
  line: { color: roles.text, fontSize: fontSize.sm },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  planCard: {
    gap: space[2],
    padding: space[4],
    borderWidth: 1,
    borderColor: roles.border,
    borderRadius: radius.md,
    backgroundColor: roles.surface,
  },
  recommended: { borderColor: colors.orange, borderWidth: 2 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  planName: { color: roles.text, fontSize: fontSize.lg },
  badges: { flexDirection: 'row', gap: space[1] },
  price: { color: roles.text, fontSize: fontSize.xl },
  cannot: {
    gap: space[1],
    padding: space[3],
    borderLeftWidth: 3,
    borderLeftColor: colors.yellow,
    backgroundColor: wash.yellow,
    borderRadius: radius.sm,
  },
});
