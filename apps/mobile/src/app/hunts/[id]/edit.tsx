import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { Hunt } from '@rein-drop/api-client';
import { editContext, huntFormContext, huntFormValues } from '@rein-drop/client-core';
import { roles } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { HuntFormFlow } from '@/components/HuntFormFlow';
import { getApiClient } from '@/config/api';
import { Button, LoadingState, Screen, SystemBanner } from '@/ui';

/** Edit Hunt: the Create Hunt form, filled from the saved hunt. Archived hunts are read-only. */
export default function EditHuntScreen() {
  return (
    <SessionGate>
      <EditHuntLoader />
    </SessionGate>
  );
}

function EditHuntLoader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; hunt: Hunt } | { status: 'error'; message: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getApiClient()
      .getHunt(id)
      .then(
        (hunt) => !cancelled && setState({ status: 'ready', hunt }),
        (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label="Loading the Hunt…" />
      </View>
    );
  }
  if (state.status === 'error' || state.hunt.status === 'ARCHIVED') {
    return (
      <Screen>
        <SystemBanner
          tone={state.status === 'error' ? 'error' : 'info'}
          title={state.status === 'error' ? "Couldn't load this Hunt" : "Archived Hunts can't be edited"}
          message={state.status === 'error' ? state.message : 'Restore it first - it comes back paused, ready to edit.'}
          action={
            <Button variant="secondary" onPress={() => router.back()}>
              Back
            </Button>
          }
        />
      </Screen>
    );
  }
  const context = editContext(state.hunt, huntFormContext(session.user.locale));
  return <HuntFormFlow values={huntFormValues(state.hunt, context)} context={context} prefilled={[]} placeholder="" editing={state.hunt} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
});
