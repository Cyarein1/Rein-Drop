import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import type { EntitlementEvaluation } from '@rein-drop/api-client';
import { cancellationState } from '@rein-drop/client-core';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { ProductState } from '@/components/ProductState';
import { getApiClient } from '@/config/api';
import { font, LoadingState, Screen, SystemBanner } from '@/ui';

/**
 * Cancellation flow - PLACEHOLDER until a billing provider exists (D2). What would happen (nothing
 * is deleted), keep the plan, and plainly: online cancellation isn't available yet.
 */
export default function CancelPlanScreen() {
  return (
    <SessionGate>
      <CancelPlan />
    </SessionGate>
  );
}

function CancelPlan() {
  const [ent, setEnt] = useState<EntitlementEvaluation | null | 'error'>(null);
  const load = useCallback(() => {
    let cancelled = false;
    getApiClient()
      .getEntitlements()
      .then(
        (e) => !cancelled && setEnt(e),
        () => !cancelled && setEnt('error'),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  const view = ent && ent !== 'error' ? cancellationState({ name: ent.plan.name, isFree: ent.plan.code === 'free' }) : null;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Cancel plan' }} />
      {ent === null && <LoadingState label="Loading your plan…" />}
      {ent === 'error' && <SystemBanner tone="error" title="Couldn't load your plan" message="Go back to Settings and try again." />}
      {view && (
        <ProductState view={view}>
          {view.consequences.map((c) => (
            <Text key={c} style={[styles.item, font('regular')]}>
              • {c}
            </Text>
          ))}
          {view.consequences.length > 0 && <SystemBanner tone="info" title="Not available yet" message={view.unavailableReason} />}
        </ProductState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { color: roles.text, fontSize: fontSize.md },
});
