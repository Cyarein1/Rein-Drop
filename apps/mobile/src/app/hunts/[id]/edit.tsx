import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { Hunt } from '@rein-drop/api-client';
import { editContext, huntFormValues } from '@rein-drop/client-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { HuntFormFlow } from '@/components/HuntFormFlow';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { Button, colors, GUTTER, LoadingState, SystemBanner } from '@/ui';

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
  const display = useDisplayContext();
  const insets = useSafeAreaInsets();
  const { t } = display;
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
        <LoadingState label={t('hunts.loadingOne')} />
      </View>
    );
  }
  if (state.status === 'error' || state.hunt.status === 'ARCHIVED') {
    return (
      <View style={[styles.error, { paddingTop: insets.top + space[3] }]}>
        <SystemBanner
          tone={state.status === 'error' ? 'error' : 'info'}
          title={state.status === 'error' ? t('hunts.loadOneFailed') : t('hunts.archivedNoEditTitle')}
          message={state.status === 'error' ? state.message : t('hunts.archivedNoEditBody')}
          action={
            <Button variant="secondary" onPress={() => router.back()}>
              {t('hunts.back')}
            </Button>
          }
        />
      </View>
    );
  }
  const context = editContext(state.hunt, display);
  return <HuntFormFlow values={huntFormValues(state.hunt, context)} context={context} prefilled={[]} placeholder="" editing={state.hunt} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  // The edit route has no navigation header: keep clear of the status bar.
  error: { flex: 1, paddingHorizontal: GUTTER, backgroundColor: colors.background },
});
