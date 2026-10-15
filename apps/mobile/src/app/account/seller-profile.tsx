import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { SellerSnapshot } from '@rein-drop/api-client';
import { snapshotAnswerRows } from '@rein-drop/client-core';
import { SessionGate } from '@/auth/SessionGate';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, colors, ListRow, ListSection, LoadingState, Screen, SystemBanner } from '@/ui';

/** Account > Seller Snapshot: the five onboarding answers (Screenbook frame 30), edited in onboarding. Reloads on focus. */
export default function SellerProfileScreen() {
  return (
    <SessionGate>
      <SellerProfile />
    </SessionGate>
  );
}

function SellerProfile() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; snapshot: SellerSnapshot }>({ status: 'loading' });

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

  const title = <Stack.Screen options={{ title: t('account.snapshotTitle') }} />;
  if (state.status !== 'ready') {
    return (
      <Screen variant="grouped">
        {title}
        {state.status === 'loading' ? <LoadingState label={t('onboarding.loadingAnswers')} /> : <SystemBanner tone="error" title={t('onboarding.loadFailed')} message={t('account.reopenToRetry')} />}
      </Screen>
    );
  }

  const { snapshot } = state;
  if (snapshot.status === 'not_started' || snapshot.status === 'not_reseller') {
    const notStarted = snapshot.status === 'not_started';
    return (
      <Screen variant="grouped">
        {title}
        <ListSection footer={notStarted ? t('account.snapshotNotStarted') : t('account.snapshotNotReseller')}>
          <ListRow
            title={notStarted ? t('account.setUpNow') : t('onboarding.changeAnswer')}
            onPress={() => router.push(notStarted ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
            last
          />
        </ListSection>
      </Screen>
    );
  }

  const inProgress = snapshot.status === 'in_progress';
  const rows = snapshotAnswerRows(snapshot, context);
  return (
    <Screen variant="grouped">
      {title}
      {inProgress && (
        <View style={styles.badge}>
          <Badge tone="fresh">{t('account.notFinished')}</Badge>
        </View>
      )}
      <ListSection footer={t('account.snapshotNote')}>
        {rows.map((row, i) => (
          <ListRow key={row.question} title={row.question} subtitle={row.answer} accessibilityLabel={t('account.labelValue', { label: row.question, value: row.answer })} last={i === rows.length - 1} />
        ))}
      </ListSection>
      <ListSection>
        <ListRow
          title={inProgress ? t('account.finishSetup') : t('account.editAnswers')}
          onPress={() => router.push(inProgress ? '/onboarding' : { pathname: '/onboarding', params: { edit: '1' } })}
          last
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { marginHorizontal: 4, marginBottom: -8, backgroundColor: colors.grouped },
});
