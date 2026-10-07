import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { SellerSnapshot } from '@rein-drop/api-client';
import { SELLER_SNAPSHOT_QUESTION_COUNT, answeredQuestionCount } from '@rein-drop/client-core';
import { roles } from '@rein-drop/design-tokens';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { getApiClient } from '@/config/api';
import { Button, Card, EmptyState, font, Metric, Screen, SystemBanner } from '@/ui';

/**
 * Onboarding opens by itself once per app launch (Blueprint section 2: new users set up before
 * the dashboard). If the user closes it, Home keeps a "finish setting up" prompt instead of
 * reopening it on every visit.
 */
let onboardingPromptedThisLaunch = false;

/** Returning-user home (App Flow Blueprint, section 8). */
export default function HomeScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SellerSnapshot | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.resolve()
        .then(() => getApiClient().getSellerSnapshot())
        .then(
          (s) => {
            if (cancelled) return;
            setSnapshot(s);
            const unfinished = s.status === 'not_started' || s.status === 'in_progress';
            if (unfinished && !onboardingPromptedThisLaunch) {
              onboardingPromptedThisLaunch = true;
              router.push('/onboarding');
            }
          },
          // Home still works without it; Settings shows the snapshot state.
          () => undefined,
        );
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  const unfinished = snapshot && (snapshot.status === 'not_started' || snapshot.status === 'in_progress');

  return (
    <Screen description="Is Rein Drop working, and is anything worth your attention?">
      {unfinished && (
        <SystemBanner
          tone="info"
          title="Finish setting up Rein Drop"
          message={
            snapshot.status === 'in_progress'
              ? `${answeredQuestionCount(snapshot)} of ${SELLER_SNAPSHOT_QUESTION_COUNT} questions answered. Your answers set up your first Hunt.`
              : 'Five quick questions set Rein Drop up around how you source.'
          }
          action={
            <Button variant="secondary" onPress={() => router.push('/onboarding')}>
              {snapshot.status === 'in_progress' ? 'Continue setup' : 'Start setup'}
            </Button>
          }
        />
      )}

      <PlaceholderNotice>Real data arrives once Hunts, deals and outcomes are implemented.</PlaceholderNotice>

      <Card title="Attention now">
        <EmptyState
          mascot="welcome"
          title="Set up your first Hunt"
          description="Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on."
          action={<Button onPress={() => router.push('/hunts/new')}>Create Hunt</Button>}
        />
      </Card>

      <Card title="Live Hunts">
        <Text style={[styles.muted, font('regular')]}>No live Hunts yet.</Text>
      </Card>

      <Card title="Profit snapshot">
        <View style={styles.metrics}>
          <Metric label="Realized profit" value="—" caption="Appears after your first logged sale" />
          <Metric label="Bought" value="—" />
          <Metric label="Sold" value="—" />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: roles.textMuted },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
});
